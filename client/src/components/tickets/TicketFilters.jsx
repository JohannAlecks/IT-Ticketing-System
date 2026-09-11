import { Search, SlidersHorizontal, X } from 'lucide-react';
import Select from '../ui/Select';
import Input from '../ui/Input';
import { useAgents } from '../../hooks/useAgents';
import { useAuth } from '../../context/AuthContext';
import { ticketCategories } from '../../constants/ticketCategories';
import { SLA_FILTER_STATES } from '../../hooks/useSla';

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'];
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export default function TicketFilters({ filters, onChange, assignedOnly = false }) {
  const { role, user } = useAuth();
  const { data: agents } = useAgents();
  const showAgentFilter = !assignedOnly && (role === 'ADMIN' || role === 'AGENT');
  const showSlaFilter = (role === 'ADMIN' || role === 'AGENT') && filters.archive !== 'archived';
  const showDepartmentFilter = role === 'ADMIN';
  const agentSlaScoped = role === 'AGENT' && Boolean(filters.slaState);

  const update = (patch) => onChange({ ...filters, ...patch, page: 1 });
  const updateSlaState = (value) => {
    const patch = { slaState: value || undefined };
    if (value && role === 'AGENT' && user?.id) { patch.assignedToId = user.id; patch.assignmentState = undefined; }
    if (!value && role === 'AGENT' && user?.id && filters.assignedToId === user.id) patch.assignedToId = undefined;
    update(patch);
  };
  const activeCount = Object.keys(filters).filter((key) => !['page', 'limit', 'archive'].includes(key) && (filters[key] || (key === 'isWorkBlocking' && filters[key] === false))).length;
  const clearFilters = () => onChange({
    page: 1,
    limit: filters.limit || 15,
    ...(filters.archive ? { archive: filters.archive } : {}),
  });

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><SlidersHorizontal className="h-4 w-4 text-brand-600" /> Search & filters</div>{activeCount > 0 && <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"><X className="h-3.5 w-3.5" /> Clear filters</button>}</div>
      <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[220px] flex-1">
          <label htmlFor="ticket-search" className="mb-1.5 block text-sm font-medium text-gray-700">Search</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            id="ticket-search"
            maxLength={200}
            className="input pl-9"
            placeholder="Search title or description..."
            value={filters.search || ''}
            onChange={(e) => update({ search: e.target.value || undefined })}
          />
      </div></div>
    </div>

      <div className="w-40">
        <Select
          label="Status"
          value={filters.status || ''}
          onChange={(e) => update({ status: e.target.value || undefined, ...(e.target.value !== 'PENDING' ? { pendingReason: undefined } : {}) })}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </Select>
      </div>

      <div className="w-40">
        <Select
          label="Priority"
          value={filters.priority || ''}
          onChange={(e) => update({ priority: e.target.value || undefined })}
        >
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
      </div>

      <div className="w-40">
        <Select
          label="Category"
          value={filters.category || ''}
          onChange={(e) => update({ category: e.target.value || undefined })}
        >
          <option value="">All categories</option>
          {ticketCategories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>
      </div>

      {showAgentFilter && (
        <div className="w-48">
          <Select
            label="Assigned agent"
            value={agentSlaScoped ? user?.id || '' : (filters.assignedToId || '')}
            disabled={agentSlaScoped}
            onChange={(e) => update({ assignedToId: e.target.value || undefined, ...(e.target.value ? { assignmentState: undefined } : {}) })}
          >
            <option value="">All agents</option>
            {agents?.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          {agentSlaScoped && <p className="mt-1 text-xs text-slate-500">SLA filters are limited to tickets assigned to you.</p>}
        </div>
      )}

      {showSlaFilter && (
        <div className="w-44">
          <Select
            id="ticket-sla-state"
            label="SLA state"
            value={filters.slaState || ''}
            onChange={(e) => updateSlaState(e.target.value)}
          >
            <option value="">All SLA states</option>
            {SLA_FILTER_STATES.map((state) => (
              <option key={state} value={state}>{state.replace('_', ' ')}</option>
            ))}
          </Select>
          {role === 'AGENT' && filters.slaState && <p className="mt-1 text-xs text-slate-500">Limited to tickets assigned to you.</p>}
        </div>
      )}

      {showDepartmentFilter && (
        <div className="w-48">
          <Input
            id="ticket-department"
            label="Department"
            placeholder="Requester department"
            value={filters.department || ''}
            onChange={(e) => update({ department: e.target.value || undefined })}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-3 pt-3">
        <Select label="Work blocking" value={filters.isWorkBlocking === undefined ? '' : String(filters.isWorkBlocking)} onChange={(e) => update({ isWorkBlocking: e.target.value === '' ? undefined : e.target.value === 'true' })}>
          <option value="">All impact levels</option><option value="true">Work blocking</option><option value="false">Not work blocking</option>
        </Select>
        {role !== 'USER' && <>
          {!assignedOnly && <Select label="Assignment state" value={filters.assignmentState || ''} onChange={(e) => update({ assignmentState: e.target.value || undefined, ...(e.target.value === 'UNASSIGNED' ? { assignedToId: undefined, ...(role === 'AGENT' ? { slaState: undefined } : {}) } : {}) })}>
            <option value="">Any assignment</option><option value="ASSIGNED">Assigned</option><option value="UNASSIGNED">Unassigned</option>
          </Select>}
          <Select label="Waiting reason" value={filters.pendingReason || ''} onChange={(e) => update({ pendingReason: e.target.value || undefined, ...(e.target.value ? { status: 'PENDING' } : {}) })}>
            <option value="">Any reason</option><option value="WAITING_FOR_REQUESTER">Waiting for requester</option><option value="OTHER">Other</option>
          </Select>
        </>}
        <Select label="Sort by" value={filters.sortField || 'createdAt'} onChange={(e) => update({ sortField: e.target.value })}>
          <option value="createdAt">Created</option><option value="updatedAt">Updated</option><option value="priority">Technical priority</option><option value="status">Status</option>
        </Select>
        <Select label="Sort direction" value={filters.sortDirection || 'desc'} onChange={(e) => update({ sortDirection: e.target.value })}><option value="desc">Descending</option><option value="asc">Ascending</option></Select>
      </div>
    </div>
  );
}
