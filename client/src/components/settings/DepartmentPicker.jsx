import { useState } from 'react';
import { useDepartments } from '../../hooks/useDepartments';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
// Paged search avoids an unbounded organization directory download. Only a
// previously assigned inactive row is offered, never arbitrary inactive IDs.
export default function DepartmentPicker({ value, onChange, current, disabled, label = 'Department', includeInactive = false, allowEmpty = true, emptyLabel = 'Not specified' }) {
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const query = useDepartments(includeInactive ? 'list' : 'options', { search, page, limit: 20, ...(includeInactive ? { status: 'ALL' } : {}) });
  const selectedQuery = useDepartments('members', { page: 1, limit: 1 }, includeInactive && value ? value : undefined);
  const [chosen, setChosen] = useState(null);
  const rows = query.data?.departments || [];
  const extras = [current, chosen, selectedQuery.data?.department].filter((r, i, all) => r?.id && !rows.some((v) => v.id === r.id) && all.findIndex((v) => v?.id === r.id) === i);
  const select = (id) => { const row = [...rows, ...extras].find((d) => d.id === id); setChosen(row || null); onChange(id || null, row); };
  return <div className="space-y-2 min-w-0">
    <Input label={`Search ${label.toLowerCase()} options`} type="search" maxLength={100} value={search} disabled={disabled} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
    <Select label={label} value={value || ''} disabled={disabled || query.isError || query.isPending} onChange={(e) => select(e.target.value)}>
      <option value="" disabled={!allowEmpty}>{allowEmpty ? emptyLabel : 'Select department'}</option>
      {[...extras, ...rows].map((d) => <option key={d.id} value={d.id}>{d.name}{d.isActive === false ? ' (inactive)' : ''}</option>)}
    </Select>
    {query.isPending && <p role="status" className="text-sm">Loading departments…</p>}
    {query.isError && <p role="alert" className="text-sm">Department options unavailable. Existing selection is preserved. <Button type="button" size="sm" onClick={() => query.refetch()}>Retry departments</Button></p>}
    {query.data?.pagination.totalPages > 1 && <div className="flex gap-2"><Button type="button" size="sm" variant="secondary" disabled={page <= 1 || disabled} onClick={() => setPage(page - 1)}>Previous options</Button><span className="text-sm">Page {page}</span><Button type="button" size="sm" variant="secondary" disabled={page >= query.data.pagination.totalPages || disabled} onClick={() => setPage(page + 1)}>Next options</Button></div>}
  </div>;
}
