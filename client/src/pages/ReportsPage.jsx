import { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CircleDot, Clock, ListChecks, Ticket, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { reportsApi, sanitizeReportFilename } from '../api/reports.api';
import {
  getAuthorizedReportFilters,
  REPORT_DEFAULT_SORT_ORDER,
  REPORT_PAGE_LIMIT,
  useReports,
} from '../hooks/useReports';
import ReportsFilters from '../components/reports/ReportsFilters';
import ReportMetricCard from '../components/reports/ReportMetricCard';
import ReportOperations from '../components/reports/ReportOperations';
import ReportsTable from '../components/reports/ReportsTable';
import ReportTrend from '../components/reports/ReportTrend';
import { ReportsEmptyState, ReportsErrorState, ReportsLoadingState } from '../components/reports/ReportsStates';
import Pagination from '../components/tickets/Pagination';
import DistributionList from '../components/dashboard/DistributionList';
import Button from '../components/ui/Button';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const ROLE_COPY = {
  AGENT: {
    heading: 'My Reports',
    subtitle: 'Analyze your assigned support work, outcomes, and ticket details.',
  },
  ADMIN: {
    heading: 'Service Desk Reports',
    subtitle: 'Analyze service desk volume, operations, and authorized ticket detail.',
  },
};

const AGENT_METRICS = [
  { key: 'assignedDuring', label: 'Assigned during range', icon: Ticket, tone: 'brand' },
  { key: 'resolvedByMe', label: 'Resolved by me', icon: CheckCircle2, tone: 'emerald' },
  { key: 'activeAssigned', label: 'Active assigned', icon: CircleDot, tone: 'blue' },
  { key: 'workBlockingActive', label: 'Work-blocking active', icon: AlertTriangle, tone: 'red' },
  { key: 'reopened', label: 'Reopened', icon: Activity, tone: 'amber' },
  { key: 'averageResolutionHours', label: 'Average resolution hours', icon: Clock, tone: 'violet' },
];

const ADMIN_METRICS = [
  { key: 'created', label: 'Created', icon: Ticket, tone: 'brand' },
  { key: 'closed', label: 'Closed', icon: CheckCircle2, tone: 'emerald' },
  { key: 'active', label: 'Active', icon: CircleDot, tone: 'blue' },
  { key: 'workBlocking', label: 'Work-blocking', icon: AlertTriangle, tone: 'red' },
  { key: 'reopened', label: 'Reopened', icon: Activity, tone: 'amber' },
  { key: 'unassignedActive', label: 'Unassigned active', icon: Users, tone: 'violet' },
  { key: 'averageResolutionHours', label: 'Average resolution hours', icon: Clock, tone: 'slate' },
];

function normalizeRole(role) {
  return typeof role === 'string' ? role.toUpperCase() : '';
}

function parseUtcDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function isRealUtcDate(value) {
  const date = parseUtcDate(value);
  if (!date) return false;
  const [year, month, day] = String(value).split('-').map(Number);
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function shiftUtcDate(value, offset) {
  const date = parseUtcDate(value);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function todayUtcDate(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function getQuickRange(days, now = new Date()) {
  const to = todayUtcDate(now);
  const count = Number(days);
  return { from: shiftUtcDate(to, -(count - 1)), to };
}

export function createDefaultReportFilters(now = new Date()) {
  return {
    ...getQuickRange(30, now),
    status: '',
    category: '',
    priority: '',
    workBlocking: 'all',
    department: '',
    agentId: '',
    search: '',
    interval: 'day',
    page: 1,
    limit: REPORT_PAGE_LIMIT,
    sortOrder: REPORT_DEFAULT_SORT_ORDER,
  };
}

export function validateReportFilters(filters) {
  const from = filters?.from;
  const to = filters?.to;
  if (!isRealUtcDate(from) || !isRealUtcDate(to)) {
    return 'Enter real dates in YYYY-MM-DD format for both the start and end of the range.';
  }
  const fromDate = parseUtcDate(from);
  const toDate = parseUtcDate(to);
  if (fromDate > toDate) return 'The start date must be on or before the end date.';
  const days = Math.floor((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY) + 1;
  if (days > 366) return 'Choose a range of 366 calendar days or fewer.';
  return '';
}

function displayRole(authRole, serverRole) {
  const authenticated = normalizeRole(authRole);
  const reported = normalizeRole(serverRole);
  if (authenticated === 'ADMIN') {
    if (reported === 'ADMIN') return 'ADMIN';
    if (reported === 'AGENT') return 'AGENT';
    return 'USER';
  }
  if (authenticated === 'AGENT') return reported === 'AGENT' ? 'AGENT' : 'USER';
  return 'USER';
}

function dateLabel(value) {
  if (!value) return 'Not available';
  const date = parseUtcDate(String(value).slice(0, 10));
  if (!date) return String(value);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function rangeDays(range, fallbackFilters) {
  const explicit = Number(range?.days);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const from = parseUtcDate(fallbackFilters?.from);
  const to = parseUtcDate(fallbackFilters?.to);
  if (!from || !to) return null;
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY) + 1;
}

function generatedLabel(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
}

function metricNote(notes, key) {
  const note = notes?.[key];
  if (typeof note === 'string') return note;
  if (note && typeof note === 'object') return note.description || note.note || note.text;
  return undefined;
}

function metricDefinitions(role) {
  return role === 'ADMIN' ? ADMIN_METRICS : AGENT_METRICS;
}

function filterLabel(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function activeFilters(filters, role) {
  const items = [];
  if (filters?.status) items.push(`Status: ${filterLabel(filters.status)}`);
  if (filters?.category) items.push(`Category: ${filterLabel(filters.category)}`);
  if (filters?.priority) items.push(`Priority: ${filterLabel(filters.priority)}`);
  if (filters?.workBlocking && filters.workBlocking !== 'all') items.push(`Work-blocking: ${filters.workBlocking === 'yes' ? 'Yes' : 'No'}`);
  if (filters?.search) items.push(`Search: ${filters.search}`);
  if (filters?.interval && filters.interval !== 'day') items.push(`Trend interval: ${filterLabel(filters.interval)}`);
  if (role === 'ADMIN' && filters?.agentId) items.push(`Agent: ${filters.agentId}`);
  if (role === 'ADMIN' && filters?.department) items.push(`Department: ${filterLabel(filters.department)}`);
  return items;
}

function ReportHeader({ role, user, summary, filters, exportDisabled, onExport, exportError }) {
  const copy = ROLE_COPY[role] || ROLE_COPY.AGENT;
  const range = summary?.range || {};
  const from = range.from || filters?.from;
  const to = range.to || filters?.to;
  const days = rangeDays(range, filters);
  return (
    <section className="card overflow-hidden p-5 sm:p-6" aria-labelledby="reports-heading">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow text-brand-700">HelpDesk reports</p>
          <h1 id="reports-heading" className="page-title mt-1">{copy.heading}</h1>
          <p className="page-subtitle">{copy.subtitle}{user?.name ? ` Welcome, ${user.name.split(' ')[0]}.` : ''}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Selected range: {dateLabel(from)} – {dateLabel(to)}{days ? ` (${days} days)` : ''}</span>
            <span>Timezone: UTC</span>
            <span>Last generated: <time dateTime={summary?.generatedAt || undefined}>{generatedLabel(summary?.generatedAt)}</time></span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <Button type="button" variant="secondary" onClick={onExport} disabled={exportDisabled}>
            Export authorized report CSV
          </Button>
          <p className="max-w-xs text-left text-xs text-slate-500 sm:text-right">The server applies your role and authorized report filters to this download.</p>
          {exportError && <p role="alert" className="max-w-xs text-xs font-medium text-red-700">{exportError}</p>}
        </div>
      </div>
    </section>
  );
}

function ActiveFilterSummary({ filters, role }) {
  const items = activeFilters(filters, role);
  return (
    <section className="card p-4" aria-labelledby="reports-active-filters-heading">
      <div className="flex flex-wrap items-start gap-3">
        <ListChecks aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <div className="min-w-0">
          <h2 id="reports-active-filters-heading" className="text-sm font-semibold text-slate-900">Applied filters</h2>
          {items.length === 0 ? <p className="mt-1 text-sm text-slate-500">All statuses, categories, priorities, and work-blocking states.</p> : (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Applied report filters">
              {items.map((item) => <li key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{item}</li>)}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function DefinitionsHelp({ role, summary }) {
  return (
    <section className="card p-5" aria-labelledby="reports-definitions-heading">
      <h2 id="reports-definitions-heading" className="text-base font-semibold text-slate-900">Definitions & help</h2>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold text-slate-800">Date range</dt><dd className="mt-1 text-slate-500">Dates are inclusive UTC calendar dates; the server returns the authoritative boundary.</dd></div>
        <div><dt className="font-semibold text-slate-800">Work-blocking</dt><dd className="mt-1 text-slate-500">Use the text labels and exact counts; color is never the only indicator.</dd></div>
        <div><dt className="font-semibold text-slate-800">Trend interval</dt><dd className="mt-1 text-slate-500">Daily, weekly, or monthly points are grouped by the selected interval.</dd></div>
        <div><dt className="font-semibold text-slate-800">Access scope</dt><dd className="mt-1 text-slate-500">{role === 'ADMIN' ? 'Service desk data includes the administrator-authorized operational fields.' : 'This view is scoped to your assigned work by the server.'}</dd></div>
      </dl>
      {summary?.metricNotes && <p className="mt-4 text-xs text-slate-500">Metric notes are supplied by the reporting service for the selected range.</p>}
    </section>
  );
}

function getTicketRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.tickets)) return data.tickets;
  if (Array.isArray(data?.data?.rows)) return data.data.rows;
  if (Array.isArray(data?.data?.tickets)) return data.data.tickets;
  return [];
}

function getPagination(data, rowCount, filters) {
  const source = data?.pagination || data || {};
  const page = Number(source.page ?? filters?.page ?? 1) || 1;
  const limit = Number(source.limit ?? filters?.limit ?? REPORT_PAGE_LIMIT) || REPORT_PAGE_LIMIT;
  const total = Number(source.total ?? rowCount);
  const totalPages = Number(source.totalPages ?? (total > 0 ? Math.ceil(total / limit) : 1));
  return {
    page: Math.max(1, page),
    limit: Math.max(1, limit),
    total: Number.isFinite(total) ? Math.max(0, total) : rowCount,
    totalPages: Number.isFinite(totalPages) ? Math.max(1, totalPages) : 1,
    sortOrder: source.sortOrder || filters?.sortOrder || REPORT_DEFAULT_SORT_ORDER,
  };
}

function ReportMetrics({ role, summary }) {
  const notes = summary?.metricNotes;
  return (
    <section aria-labelledby="reports-metrics-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="reports-metrics-heading" className="eyebrow">Analytical metrics</h2>
        <p className="text-xs text-slate-500">Server-calculated for the applied range</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {metricDefinitions(role).map(({ key, label, icon, tone }) => (
          <ReportMetricCard key={key} label={label} value={summary?.metrics?.[key]} note={metricNote(notes, key)} icon={icon} tone={tone} />
        ))}
      </div>
    </section>
  );
}

function ReportDistributions({ role, summary }) {
  const distributions = summary?.distributions || {};
  const status = role === 'ADMIN' ? 'Tickets by status' : 'My tickets by status';
  const category = role === 'ADMIN' ? 'Tickets by category' : 'My tickets by category';
  return (
    <section aria-labelledby="reports-distributions-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="reports-distributions-heading" className="eyebrow">Distributions</h2>
        <p className="text-xs text-slate-500">Exact values are shown beside every bar</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <DistributionList id="reports-status-distribution" title={status} description="Ticket count by current status." distribution={distributions.byStatus} emptyTitle="No status distribution" emptyDescription="No status values were returned for this range." />
        <DistributionList id="reports-category-distribution" title={category} description="Ticket count by category." distribution={distributions.byCategory} emptyTitle="No category distribution" emptyDescription="No category values were returned for this range." />
        {role === 'ADMIN' && <DistributionList id="reports-priority-distribution" title="Tickets by priority" description="Ticket count by priority." distribution={distributions.byPriority} emptyTitle="No priority distribution" emptyDescription="No priority values were returned for this range." />}
        {role === 'ADMIN' && <DistributionList id="reports-department-distribution" title="Tickets by department" description="Ticket count by requester department." distribution={distributions.byDepartment} emptyTitle="No department distribution" emptyDescription="No department values were returned for this range." />}
      </div>
    </section>
  );
}

function ReportTickets({ data, query, isAdmin, filters, onRetry, retrying, onPageChange }) {
  const rows = getTicketRows(data);
  const pagination = getPagination(data, rows.length, filters);
  return (
    <section aria-labelledby="reports-detail-section-heading">
      <h2 id="reports-detail-section-heading" className="sr-only">Detailed report table</h2>
      {query.isError ? (
        <ReportsErrorState onRetry={onRetry} retrying={retrying} message="The detailed report tickets could not be loaded." />
      ) : query.isLoading || (query.isFetching && !data) ? (
        <div role="status" aria-live="polite" className="card px-5 py-10 text-center text-sm text-slate-500">Loading detailed report tickets…</div>
      ) : rows.length === 0 ? (
        <ReportsEmptyState message="No tickets match the selected range and filters." />
      ) : (
        <>
          <ReportsTable rows={rows} isAdmin={isAdmin} />
          <Pagination pagination={pagination} onPageChange={onPageChange} />
        </>
      )}
    </section>
  );
}

export default function ReportsPage() {
  const { role: authenticatedRole, user } = useAuth();
  const [draftFilters, setDraftFilters] = useState(() => createDefaultReportFilters());
  const [committedFilters, setCommittedFilters] = useState(() => createDefaultReportFilters());
  const [rangeMode, setRangeMode] = useState('30');
  const [validationMessage, setValidationMessage] = useState('');
  const [exportError, setExportError] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const { summaryQuery, ticketsQuery } = useReports(committedFilters);
  const summary = summaryQuery?.data;
  const authRole = normalizeRole(authenticatedRole);
  const role = displayRole(authRole, summary?.role);
  const isAdmin = role === 'ADMIN' && authRole === 'ADMIN';
  const copy = ROLE_COPY[role] || ROLE_COPY.AGENT;

  const commitFilters = (nextFilters) => {
    const message = validateReportFilters(nextFilters);
    if (message) {
      setValidationMessage(message);
      return false;
    }
    setValidationMessage('');
    setCommittedFilters(getAuthorizedReportFilters({
      ...nextFilters,
      page: 1,
      limit: nextFilters?.limit || REPORT_PAGE_LIMIT,
      sortOrder: nextFilters?.sortOrder || REPORT_DEFAULT_SORT_ORDER,
    }, authRole, 'tickets'));
    return true;
  };

  const handleDraftChange = (patch) => {
    setDraftFilters((previous) => ({ ...previous, ...patch }));
    if (Object.prototype.hasOwnProperty.call(patch, 'from') || Object.prototype.hasOwnProperty.call(patch, 'to')) setRangeMode('custom');
    if (validationMessage) setValidationMessage('');
  };

  const handleCustomRange = () => setRangeMode('custom');

  const handleQuickRange = (days) => {
    const next = { ...draftFilters, ...getQuickRange(days) };
    setDraftFilters(next);
    setRangeMode(String(days));
    commitFilters(next);
  };

  const handleReset = () => {
    const next = createDefaultReportFilters();
    setDraftFilters(next);
    setRangeMode('30');
    setExportError('');
    commitFilters(next);
  };

  const handlePageChange = (page) => {
    setCommittedFilters((previous) => ({ ...previous, page }));
  };

  const handleExport = async () => {
    setExportError('');
    setIsExporting(true);
    try {
      const params = getAuthorizedReportFilters(committedFilters, role, 'export');
      const result = await reportsApi.exportTickets(params);
      const blob = result?.blob ?? result;
      if (!blob || typeof URL?.createObjectURL !== 'function') throw new Error('The CSV download is unavailable.');
      const objectUrl = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = sanitizeReportFilename(result?.filename);
        link.setAttribute('aria-hidden', 'true');
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (error) {
      setExportError(error?.response?.data?.message || error?.message || 'The authorized report CSV could not be downloaded. Try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const summaryLoading = Boolean(summaryQuery?.isLoading || summaryQuery?.isPending);
  const summaryFetching = Boolean(summaryQuery?.isFetching);
  const ticketsFetching = Boolean(ticketsQuery?.isFetching || ticketsQuery?.isLoading || ticketsQuery?.isPending);
  const exportDisabled = isExporting || summaryFetching || ticketsFetching;

  if (summaryLoading && !summary) return <ReportsLoadingState heading={copy.heading} />;

  if ((summaryQuery?.isError || !summary) && !summary) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="card p-5 sm:p-6" aria-labelledby="reports-heading">
          <p className="eyebrow text-brand-700">HelpDesk reports</p>
          <h1 id="reports-heading" className="page-title mt-1">{copy.heading}</h1>
          <p className="page-subtitle">The report could not be loaded for this account.</p>
        </section>
        <ReportsErrorState onRetry={summaryQuery?.refetch} retrying={summaryFetching} />
      </div>
    );
  }

  if (role !== 'AGENT' && role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="card p-5 sm:p-6" aria-labelledby="reports-heading">
          <p className="eyebrow text-brand-700">HelpDesk reports</p>
          <h1 id="reports-heading" className="page-title mt-1">Reports unavailable</h1>
          <p className="page-subtitle">The authenticated role and server report role do not authorize a report view.</p>
        </section>
        <ReportsErrorState onRetry={summaryQuery?.refetch} retrying={summaryFetching} message="Ask an administrator to verify your reporting access, then try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ReportHeader role={role} user={user} summary={summary} filters={committedFilters} exportDisabled={exportDisabled} onExport={handleExport} exportError={exportError} />

      <ReportsFilters
        draft={draftFilters}
        rangeMode={rangeMode}
        isAdmin={isAdmin}
        filterOptions={isAdmin ? summary?.filterOptions : undefined}
        validationMessage={validationMessage}
        onDraftChange={handleDraftChange}
        onCustomRange={handleCustomRange}
        onQuickRange={handleQuickRange}
        onApply={commitFilters}
        onReset={handleReset}
      />

      <ActiveFilterSummary filters={committedFilters} role={isAdmin ? 'ADMIN' : 'AGENT'} />

      <ReportMetrics role={isAdmin ? 'ADMIN' : 'AGENT'} summary={summary} />

      <ReportTrend role={isAdmin ? 'ADMIN' : 'AGENT'} trends={summary?.trends} />

      <ReportDistributions role={isAdmin ? 'ADMIN' : 'AGENT'} summary={summary} />

      <ReportOperations role={isAdmin ? 'ADMIN' : 'AGENT'} summary={summary} />

      <ReportTickets
        data={ticketsQuery?.data}
        query={ticketsQuery || {}}
        isAdmin={isAdmin}
        filters={committedFilters}
        onRetry={ticketsQuery?.refetch}
        retrying={Boolean(ticketsQuery?.isFetching)}
        onPageChange={handlePageChange}
      />

      <DefinitionsHelp role={isAdmin ? 'ADMIN' : 'AGENT'} summary={summary} />
    </div>
  );
}
