import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, CircleDot, Clock, Plus, Ticket, User, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDashboardSummary } from '../hooks/useDashboard';
import MetricCard from '../components/dashboard/MetricCard';
import DistributionList from '../components/dashboard/DistributionList';
import TicketList from '../components/dashboard/TicketList';
import AdminWorkload from '../components/dashboard/AdminWorkload';
import AuditList from '../components/dashboard/AuditList';
import {
  DashboardEmptyState,
  DashboardErrorState,
  DashboardLoadingState,
  OnboardingGuidance,
} from '../components/dashboard/DashboardStates';

const STATUS_LABELS = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  PENDING: 'Pending',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const ROLE_CONFIG = {
  USER: {
    heading: 'My Summary',
    subtitle: 'A focused view of your support requests and recent activity.',
  },
  AGENT: {
    heading: 'My Work Summary',
    subtitle: 'Keep track of assigned work, triage, and recent updates.',
  },
  ADMIN: {
    heading: 'System Summary',
    subtitle: 'A compact view of service desk health and recent operations.',
  },
};

const ACTION_LINKS = {
  USER: [
    { label: 'Create ticket', to: '/tickets/new', primary: true },
    { label: 'View tickets', to: '/tickets' },
  ],
  AGENT: [
    { label: 'Assigned queue', to: '/my-tickets', primary: true },
    { label: 'All tickets', to: '/tickets' },
    { label: 'Create ticket', to: '/tickets/new' },
  ],
  ADMIN: [
    { label: 'Tickets', to: '/tickets', primary: true },
    { label: 'Users', to: '/users' },
    { label: 'Audit log', to: '/audit-log' },
    { label: 'Create ticket', to: '/tickets/new' },
  ],
};

const ROLE_METRICS = {
  USER: [
    { key: 'active', label: 'Active', icon: Ticket, tone: 'brand' },
    { key: 'workBlocking', label: 'Work blocking', icon: AlertTriangle, tone: 'red' },
    { key: 'recentlyCreated', label: (days) => `Created (${days} days)`, icon: Plus, tone: 'blue' },
    { key: 'recentlyClosed', label: (days) => `Closed (${days} days)`, icon: CheckCircle2, tone: 'emerald' },
  ],
  AGENT: [
    { key: 'assignedActive', label: 'Assigned active', icon: Ticket, tone: 'brand' },
    { key: 'assignedWorkBlocking', label: 'Work blocking', icon: AlertTriangle, tone: 'red' },
    { key: 'eligibleUnassigned', label: 'Eligible unassigned', icon: CircleDot, tone: 'amber' },
    { key: 'recentlyUpdatedAssigned', label: (days) => `Updated assigned (${days} days)`, icon: Clock, tone: 'blue' },
    { key: 'recentlyClosedByMe', label: (days) => `Assigned closed (${days} days)`, icon: CheckCircle2, tone: 'emerald' },
  ],
  ADMIN: [
    { key: 'totalTickets', label: 'Total tickets', icon: Ticket, tone: 'brand' },
    { key: 'activeTickets', label: 'Active tickets', icon: CircleDot, tone: 'blue' },
    { key: 'unassignedActive', label: 'Unassigned active', icon: AlertTriangle, tone: 'amber' },
    { key: 'workBlockingActive', label: 'Work blocking', icon: AlertTriangle, tone: 'red' },
    { key: 'recentlyCreated', label: (days) => `Created (${days} days)`, icon: Plus, tone: 'violet' },
    { key: 'recentlyClosed', label: (days) => `Closed (${days} days)`, icon: CheckCircle2, tone: 'emerald' },
    { key: 'activeAgents', label: 'Active agents', icon: Users, tone: 'brand' },
    { key: 'inactiveUsers', label: 'Inactive users', icon: User, tone: 'slate' },
  ],
};

function normalizeRole(role) {
  return typeof role === 'string' ? role.toUpperCase() : '';
}

function getWindowDays(summary) {
  const days = Number(summary?.windowDays);
  return Number.isFinite(days) && days > 0 ? days : 7;
}

function getStatusOrder(summary) {
  const definitions = summary?.definitions || {};
  const definedStatuses = [
    ...(Array.isArray(definitions.activeStatuses) ? definitions.activeStatuses : []),
    ...(Array.isArray(definitions.terminalStatuses) ? definitions.terminalStatuses : []),
  ].filter(Boolean);
  if (definedStatuses.length > 0) return [...new Set(definedStatuses)];
  return Object.keys(summary?.distributions?.byStatus || {});
}

function InlineAction({ to, children }) {
  return <Link to={to} className="font-semibold text-brand-700 hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2">{children}</Link>;
}

function DashboardActions({ role }) {
  const links = ACTION_LINKS[role] || [];
  return (
    <nav aria-label="Summary actions" className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className={`btn px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${link.primary ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30 hover:bg-brand-700' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function SummaryHeader({ role, user, windowDays }) {
  const config = ROLE_CONFIG[role] || { heading: 'Summary', subtitle: 'A role-aware view of your support workspace.' };
  const firstName = user?.name?.split(' ')[0];
  return (
    <section className="card overflow-hidden bg-gradient-to-br from-white via-white to-brand-50/70 p-5 sm:p-6" aria-labelledby="dashboard-heading">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow text-brand-700">HelpDesk summary</p>
          <h1 id="dashboard-heading" className="page-title mt-1">{config.heading}</h1>
          <p className="page-subtitle">{config.subtitle}{firstName ? ` Welcome, ${firstName}.` : ''}</p>
          <p className="mt-2 text-xs text-slate-500">Rolling window: {windowDays} days</p>
        </div>
        <DashboardActions role={role} />
      </div>
    </section>
  );
}

function MetricGrid({ role, metrics, windowDays }) {
  const definitions = ROLE_METRICS[role] || [];
  return (
    <section aria-labelledby="summary-metrics-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="summary-metrics-heading" className="eyebrow">At a glance</h2>
        <p className="text-xs text-slate-500">Server-calculated summary metrics</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {definitions.map(({ key, label, icon, tone }) => {
          const text = typeof label === 'function' ? label(windowDays) : label;
          return <MetricCard key={key} label={text} value={metrics?.[key]} icon={icon} tone={tone} />;
        })}
      </div>
    </section>
  );
}

function UserSummary({ summary, windowDays }) {
  const distributions = summary.distributions || {};
  const lists = summary.lists || {};
  const statusOrder = getStatusOrder(summary);
  return (
    <>
      <MetricGrid role="USER" metrics={summary.metrics} windowDays={windowDays} />
      <div className="grid gap-4 lg:grid-cols-2">
        <DistributionList
          id="user-status-distribution"
          title="My tickets by status"
          description="The current status of your tickets."
          distribution={distributions.byStatus}
          order={statusOrder}
          labelMap={STATUS_LABELS}
          emptyTitle="No status data yet"
          emptyDescription="Your ticket status breakdown will appear here."
        />
        <TicketList
          id="user-active-tickets"
          title="Active tickets"
          description="Open, in-progress, and pending tickets that still need attention."
          tickets={lists.active}
          linkTo="/tickets"
          linkLabel="Open ticket list"
          emptyTitle="No active tickets"
          emptyDescription="You have no open, in-progress, or pending tickets right now."
          emptyAction={<InlineAction to="/tickets/new">Create a ticket</InlineAction>}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TicketList
          id="user-recent-tickets"
          title="Recent tickets"
          description={`Tickets created or updated in the latest ${windowDays}-day window.`}
          tickets={lists.recent}
          linkTo="/tickets"
          linkLabel="Open ticket list"
          emptyTitle="No recent tickets"
          emptyDescription="Create a ticket when you need support."
          emptyAction={<InlineAction to="/tickets/new">Create a ticket</InlineAction>}
        />
        <TicketList
          id="user-closed-tickets"
          title={`Closed tickets (${windowDays} days)`}
          description="Tickets closed in the latest summary window."
          tickets={lists.recentClosed}
          linkTo="/tickets"
          linkLabel="Open ticket list"
          emptyTitle="No closed tickets in this window"
          emptyDescription="Closed tickets will appear here as work is completed."
        />
      </div>
    </>
  );
}

function AgentSummary({ summary, windowDays }) {
  const distributions = summary.distributions || {};
  const lists = summary.lists || {};
  const statusOrder = getStatusOrder(summary);
  return (
    <>
      <MetricGrid role="AGENT" metrics={summary.metrics} windowDays={windowDays} />
      <div className="grid gap-4 lg:grid-cols-2">
        <DistributionList
          id="agent-status-distribution"
          title="My assigned tickets by status"
          description="The current status of tickets assigned to you."
          distribution={distributions.byStatus}
          order={statusOrder}
          labelMap={STATUS_LABELS}
          emptyTitle="No assigned status data yet"
          emptyDescription="Your assigned ticket breakdown will appear here."
        />
        <TicketList
          id="agent-priority-queue"
          title="Priority queue"
          description="Assigned support work that needs attention first."
          tickets={lists.priorityQueue}
          linkTo="/my-tickets"
          linkLabel="Open assigned queue"
          emptyTitle="No priority work"
          emptyDescription="There are no priority tickets in your queue right now."
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TicketList
          id="agent-unassigned-tickets"
          title="Unassigned tickets"
          description="Tickets available for triage from the all-tickets view."
          tickets={lists.unassigned}
          linkTo="/tickets"
          linkLabel="Open all tickets"
          emptyTitle="No unassigned tickets"
          emptyDescription="The queue has no unassigned tickets right now."
        />
        <TicketList
          id="agent-recently-updated"
          title="Recently updated assigned tickets"
          description={`Your assigned tickets updated in the latest ${windowDays}-day window.`}
          tickets={lists.recentlyUpdated}
          linkTo="/my-tickets"
          linkLabel="Open assigned queue"
          emptyTitle="No recent assigned updates"
          emptyDescription="Updates to your assigned tickets will appear here."
        />
      </div>
    </>
  );
}

function SystemStatus({ operations }) {
  const configured = operations?.emailDeliveryConfigured;
  const status = configured === true ? 'Configured' : configured === false ? 'Not configured' : 'Unavailable';
  return (
    <section className="card p-5" aria-labelledby="admin-system-status-heading">
      <h2 id="admin-system-status-heading" className="text-base font-semibold text-slate-900">System status</h2>
      <dl className="mt-4 divide-y divide-slate-100 text-sm">
        <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <dt className="text-slate-600">Email delivery</dt>
          <dd className={`font-semibold ${configured === true ? 'text-emerald-700' : configured === false ? 'text-amber-700' : 'text-slate-500'}`}>{status}</dd>
        </div>
      </dl>
    </section>
  );
}

function AdminSummary({ summary, windowDays }) {
  const distributions = summary.distributions || {};
  const lists = summary.lists || {};
  const statusOrder = getStatusOrder(summary);
  return (
    <>
      <MetricGrid role="ADMIN" metrics={summary.metrics} windowDays={windowDays} />
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <DistributionList
          id="admin-status-distribution"
          title="Tickets by status"
          description="Status across all service desk tickets."
          distribution={distributions.byStatus}
          order={statusOrder}
          labelMap={STATUS_LABELS}
          emptyTitle="No status data yet"
          emptyDescription="Ticket status data will appear here."
        />
        <DistributionList
          id="admin-category-distribution"
          title="Tickets by category"
          description="Category volume across all tickets."
          distribution={distributions.byCategory}
          emptyTitle="No category data yet"
          emptyDescription="Ticket category data will appear here."
        />
        <DistributionList
          id="admin-department-distribution"
          title="Tickets by department"
          description="All ticket volume by requester department."
          distribution={distributions.byDepartment}
          emptyTitle="No department data yet"
          emptyDescription="Ticket department data will appear here."
        />
      </div>
      <TicketList
        id="admin-priority-queue"
        title="Priority queue"
        description="Tickets requiring the earliest review across the service desk."
        tickets={lists.priorityQueue}
        linkTo="/tickets"
        linkLabel="Open all tickets"
        emptyTitle="No priority tickets"
        emptyDescription="There are no priority tickets in the current queue."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <AdminWorkload workload={lists.workload} />
        <AuditList events={lists.recentAudit} />
      </div>
      <SystemStatus operations={summary.operations} />
    </>
  );
}

const ROLE_SUMMARIES = { USER: UserSummary, AGENT: AgentSummary, ADMIN: AdminSummary };

export default function DashboardPage() {
  const { role: authRole, user } = useAuth();
  const summaryQuery = useDashboardSummary();
  const { data: summary, isLoading, isError, isFetching, refetch } = summaryQuery;
  const role = normalizeRole(summary?.role || authRole);
  const windowDays = getWindowDays(summary);
  const config = ROLE_CONFIG[role];

  if (isLoading) return <DashboardLoadingState heading={config?.heading || 'Summary'} />;

  if (isError || !summary) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <SummaryHeader role={role} user={user} windowDays={windowDays} />
        <DashboardErrorState onRetry={refetch} retrying={isFetching} />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <SummaryHeader role={role} user={user} windowDays={windowDays} />
        <DashboardEmptyState title="Summary is not available for this role" description="Return to the workspace after your account permissions are updated." />
      </div>
    );
  }

  const RoleSummary = ROLE_SUMMARIES[role];
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SummaryHeader role={role} user={user} windowDays={windowDays} />
      <OnboardingGuidance role={role} onboarding={summary.onboarding} />
      <RoleSummary summary={summary} windowDays={windowDays} />
    </div>
  );
}
