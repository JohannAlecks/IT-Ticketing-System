import { Search, SlidersHorizontal, X } from 'lucide-react';
import Select from '../ui/Select';
import { useAgents } from '../../hooks/useAgents';
import { useAuth } from '../../context/AuthContext';
import { ticketCategories } from '../../constants/ticketCategories';

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'];
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export default function TicketFilters({ filters, onChange }) {
  const { role } = useAuth();
  const { data: agents } = useAgents();
  const showAgentFilter = role === 'ADMIN' || role === 'AGENT';

  const update = (patch) => onChange({ ...filters, ...patch, page: 1 });
  const activeCount = Object.keys(filters).filter((key) => !['page', 'limit', 'archive'].includes(key) && filters[key]).length;
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
          onChange={(e) => update({ status: e.target.value || undefined })}
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
            value={filters.assignedToId || ''}
            onChange={(e) => update({ assignedToId: e.target.value || undefined })}
          >
            <option value="">All agents</option>
            {agents?.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
