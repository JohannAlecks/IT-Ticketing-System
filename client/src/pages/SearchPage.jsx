import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { normalizeSearch, useSearch, validSearch } from '../hooks/useSearch';
import { groupLabel, ResultContent, safeSearchPath, visibleGroups } from '../components/search/SearchResults';
import Button from '../components/ui/Button';
export function parseSearchUrl(params, role) {
  const allowed = ['q', 'type', 'page', 'pageSize', 'includeArchived'];
  const q = params.get('q') || '';
  const type = params.get('type') || 'all';
  const page = params.get('page') || '1'; const size = params.get('pageSize') || '20'; const archived = params.get('includeArchived') || 'false';
  const valid = [...params.keys()].every((k) => allowed.includes(k) && params.getAll(k).length === 1) && validSearch(q)
    && ['all', 'tickets', 'knowledge', ...(role === 'ADMIN' ? ['users'] : [])].includes(type)
    && /^[1-9]\d*$/.test(page) && Number(page) <= 100 && /^[1-9]\d*$/.test(size) && Number(size) <= 20 && ['false', 'true'].includes(archived);
  return { valid, params: { q: normalizeSearch(q), type, page: Number(page), pageSize: Number(size), includeArchived: archived === 'true' } };
}
function Page({ role }) {
  const [url, setUrl] = useSearchParams();
  const parsed = parseSearchUrl(url, role); const values = parsed.params;
  const [input, setInput] = useState(url.get('q') || '');
  const query = useSearch(values, 'full', parsed.valid);
  const groups = visibleGroups(query.data, role);
  const patch = (changes) => setUrl(new URLSearchParams({ ...values, page: 1, ...changes }));
  return <div className="space-y-5">
    <div><h1 className="page-title">Search</h1><p className="page-subtitle">Find tickets and published knowledge you can access{role === 'ADMIN' ? ', plus user accounts' : ''}.</p></div>
    <form className="flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); if (parsed.valid) patch({ q: normalizeSearch(input) }); else setUrl(new URLSearchParams({ q: normalizeSearch(input), type: 'all', includeArchived: 'false' })); }}>
      <label className="sr-only" htmlFor="full-search">Search query</label><input id="full-search" className="input min-w-0 flex-1" value={input} maxLength={100} onChange={(e) => setInput(e.target.value)} autoComplete="off" />
      <Button type="submit" disabled={!validSearch(input)}>Search</Button>
    </form>
    {!parsed.valid && <p role="alert">Enter a valid 2–100 character query. Check the result type, archived option, and page (1–100).</p>}
    {parsed.valid && <>
      <div className="flex flex-wrap items-center gap-3"><label htmlFor="search-type" className="text-slate-700">Result type</label><select id="search-type" className="input w-auto" value={values.type} onChange={(e) => patch({ type: e.target.value })}>
        <option value="all">All results</option><option value="tickets">Tickets</option><option value="knowledge">Knowledge Base</option>{role === 'ADMIN' && <option value="users">Users</option>}
      </select><label className="flex items-center gap-2 text-slate-700"><input type="checkbox" checked={values.includeArchived} onChange={(e) => patch({ includeArchived: e.target.checked })} />Include Archived</label></div>
      {query.isFetching && <p role="status">Searching…</p>}
      {query.isError && <p role="alert">Search could not be loaded. <Button onClick={() => query.refetch()}>Retry search</Button></p>}
      {query.data && !groups.some((g) => g.results.length) && <p className="card p-5 text-slate-600">No matches on this page. Try another title, identifier, or category.</p>}
      {groups.filter((g) => g.results.length).map((group) => <section key={group.type} aria-label={groupLabel[group.type]} className="card p-4">
        <h2 className="mb-3 font-semibold text-slate-900">{groupLabel[group.type]}</h2>
        <ul className="space-y-2">{group.results.map((result) => <li key={result.id}><Link className="block rounded-lg p-3 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2" to={safeSearchPath(result)}><ResultContent result={result} /></Link></li>)}</ul>
      </section>)}
      <nav aria-label="Search pagination" className="flex items-center gap-3"><Button variant="secondary" disabled={values.page <= 1 || query.isFetching} onClick={() => patch({ page: values.page - 1 })}>Previous page</Button>
        <span className="text-sm text-slate-600">Page {values.page} · up to {values.pageSize} per group</span>
        <Button variant="secondary" disabled={values.page >= 100 || !groups.some((g) => g.hasMore) || query.isFetching} onClick={() => patch({ page: values.page + 1 })}>Next page</Button></nav>
    </>}
  </div>;
}
export default function SearchPage() {
  const { user, role } = useAuth(); const [url] = useSearchParams();
  return user?.id ? <Page key={`${user.id}:${role || user.role}:${url.toString()}`} role={role || user.role} /> : null;
}
