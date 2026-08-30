import { CalendarDays, Search, SlidersHorizontal } from 'lucide-react';
import { ticketCategories } from '../../constants/ticketCategories';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'];
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const QUICK_RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

function displayEnum(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function filterOptionsFor(options, key) {
  const values = Array.isArray(options?.[key]) ? options[key] : [];
  return values.map((option) => {
    if (typeof option === 'string') return { value: option, label: displayEnum(option) };
    return {
      value: option?.id ?? option?.value ?? option?.code ?? option?.name,
      label: option?.name ?? option?.label ?? option?.department ?? option?.value,
    };
  }).filter((option) => option.value != null && option.label != null);
}

export default function ReportsFilters({
  draft,
  rangeMode,
  isAdmin,
  filterOptions,
  validationMessage,
  onDraftChange,
  onCustomRange,
  onQuickRange,
  onApply,
  onReset,
}) {
  const agents = filterOptionsFor(filterOptions, 'agents');
  const departments = filterOptionsFor(filterOptions, 'departments');
  const update = (patch) => onDraftChange(patch);

  return (
    <section className="card p-5" aria-labelledby="reports-filters-heading">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
          </div>
          <div>
            <h2 id="reports-filters-heading" className="text-base font-semibold text-slate-900">Report filters</h2>
            <p className="mt-1 text-sm text-slate-500">Choose a UTC calendar range and apply filters to refresh the report.</p>
          </div>
        </div>
        <p className="text-xs text-slate-500">Draft changes are not requested until you apply them.</p>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); onApply(draft); }}>
        <fieldset>
          <legend className="sr-only">Report date range</legend>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <CalendarDays aria-hidden="true" className="h-4 w-4 text-brand-600" /> Quick range
            </span>
            {QUICK_RANGES.map(({ days, label }) => (
              <Button
                key={days}
                type="button"
                variant={rangeMode === String(days) ? 'primary' : 'secondary'}
                size="sm"
                aria-pressed={rangeMode === String(days)}
                onClick={() => onQuickRange(days)}
              >
                {label}
              </Button>
            ))}
            <Button
              type="button"
              variant={rangeMode === 'custom' ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={rangeMode === 'custom'}
              onClick={onCustomRange}
            >
              Custom
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input
              id="reports-from-date"
              label="From date"
              type="date"
              value={draft?.from || ''}
              onChange={(event) => update({ from: event.target.value })}
              aria-invalid={Boolean(validationMessage)}
              aria-describedby={validationMessage ? 'reports-filter-validation' : undefined}
            />
            <Input
              id="reports-to-date"
              label="To date"
              type="date"
              value={draft?.to || ''}
              onChange={(event) => update({ to: event.target.value })}
              aria-invalid={Boolean(validationMessage)}
              aria-describedby={validationMessage ? 'reports-filter-validation' : undefined}
            />
          </div>
        </fieldset>

        {validationMessage && (
          <p id="reports-filter-validation" role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {validationMessage}
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select id="reports-status" label="Status" value={draft?.status || ''} onChange={(event) => update({ status: event.target.value })}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{displayEnum(status)}</option>)}
          </Select>

          <Select id="reports-category" label="Category" value={draft?.category || ''} onChange={(event) => update({ category: event.target.value })}>
            <option value="">All categories</option>
            {ticketCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
          </Select>

          <Select id="reports-priority" label="Priority" value={draft?.priority || ''} onChange={(event) => update({ priority: event.target.value })}>
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
          </Select>

          <Select id="reports-work-blocking" label="Work-blocking" value={draft?.workBlocking || 'all'} onChange={(event) => update({ workBlocking: event.target.value })}>
            <option value="all">All work-blocking states</option>
            <option value="yes">Work-blocking only</option>
            <option value="no">Not work-blocking</option>
          </Select>

          <Input
            id="reports-search"
            label="Search"
            type="search"
            placeholder="Search ticket titles..."
            value={draft?.search || ''}
            onChange={(event) => update({ search: event.target.value })}
          />

          <Select id="reports-interval" label="Trend interval" value={draft?.interval || 'day'} onChange={(event) => update({ interval: event.target.value })}>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </Select>

          {isAdmin && (
            <Select id="reports-agent" label="Agent" value={draft?.agentId || ''} onChange={(event) => update({ agentId: event.target.value })}>
              <option value="">All agents</option>
              {agents.map((agent) => <option key={agent.value} value={agent.value}>{agent.label}</option>)}
            </Select>
          )}

          {isAdmin && (
            <Select id="reports-department" label="Department" value={draft?.department || ''} onChange={(event) => update({ department: event.target.value })}>
              <option value="">All departments</option>
              {departments.map((department) => <option key={department.value} value={department.value}>{department.label}</option>)}
            </Select>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button type="submit">Apply Filters</Button>
          <Button type="button" variant="secondary" onClick={onReset}>Reset Filters</Button>
          <span className="ml-1 inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Search aria-hidden="true" className="h-3.5 w-3.5" /> Filters apply to the summary and detailed report.
          </span>
        </div>
      </form>
    </section>
  );
}
