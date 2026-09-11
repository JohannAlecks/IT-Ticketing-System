import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { normalizeSearch, validSearch, useSearch } from '../../hooks/useSearch';
import { groupLabel, ResultContent, safeSearchPath, visibleGroups } from './SearchResults';
function Control({ role }) {
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const root = useRef(null); const field = useRef(null); const id = useId();
  const navigate = useNavigate(); const location = useLocation();
  const q = normalizeSearch(input);
  const valid = validSearch(input);
  useEffect(() => { const timer = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(timer); }, [q]);
  const ready = open && valid && q === debounced;
  const query = useSearch({ q: debounced, type: 'all', includeArchived: false, limit: 5 }, 'quick', ready);
  const groups = ready ? visibleGroups(query.data, role) : [];
  const results = groups.flatMap((g) => g.results);
  const signature = results.map((r) => `${r.type}:${r.id}`).join('|');
  useEffect(() => setSelected(-1), [q, signature]);
  useEffect(() => setOpen(false), [location.key]);
  useEffect(() => {
    const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  useEffect(() => { if (selected >= 0) document.getElementById(`${id}-${selected}`)?.scrollIntoView?.({ block: 'nearest' }); }, [selected, id]);
  const viewAll = () => { setOpen(false); navigate(`/search?${new URLSearchParams({ q })}`); };
  const choose = (result) => { const path = safeSearchPath(result); if (path) { setOpen(false); navigate(path); } };
  function keyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true);
      setSelected((value) => !results.length ? -1 : value < 0 ? (event.key === 'ArrowDown' ? 0 : results.length - 1) : (value + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
    }
    if (event.key === 'Enter' && valid) { event.preventDefault(); if (open && results[selected]) choose(results[selected]); else viewAll(); }
  }
  let index = -1;
  return <div ref={root} className="relative mx-2 min-w-0 flex-1 md:max-w-lg" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
    onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); field.current?.focus(); setOpen(false); } }}>
    <label className="sr-only" htmlFor={id}>Global search</label>
    <input ref={field} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && results[selected] ? `${id}-${selected}` : undefined}
      className="input w-full" autoComplete="off" maxLength={100} placeholder={role === 'ADMIN' ? 'Search tickets, knowledge, users…' : 'Search tickets and knowledge…'} value={input}
      onFocus={() => setOpen(true)} onChange={(e) => { setInput(e.target.value); setOpen(true); }} onKeyDown={keyDown} />
    {open && <div className="fixed left-3 right-3 top-[66px] z-40 max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-[min(36rem,80vw)]">
      {!valid && <p className="text-sm text-slate-600">Enter 2–100 characters, including at least two letters or numbers.</p>}
      {valid && (!ready || query.isFetching) && <p role="status">Searching…</p>}
      {ready && query.isError && <p role="alert">Search could not be loaded. <button className="underline" onClick={() => query.refetch()}>Retry search</button></p>}
      <div role="listbox" id={`${id}-list`} aria-label="Search suggestions">
        {groups.map((group) => <div key={group.type} role="group" aria-label={groupLabel[group.type]}>
          <p className="eyebrow py-2">{groupLabel[group.type]}</p>
          {group.results.map((result) => { index += 1; const position = index; return <div role="option" aria-selected={selected === position} id={`${id}-${position}`} key={`${result.type}:${result.id}`}
            className={`cursor-pointer rounded-lg p-2 ${selected === position ? 'bg-slate-100' : 'hover:bg-slate-50'}`} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(result)}><ResultContent result={result} /></div>; })}
        </div>)}
      </div>
      {ready && query.data && !results.length && <p className="text-sm text-slate-600">No matches. Try another title, identifier, or category.</p>}
      {valid && <button className="mt-3 rounded-lg px-2 py-2 text-sm font-semibold text-slate-700 underline" onClick={viewAll}>View all results</button>}
    </div>}
  </div>;
}
export default function GlobalSearch() {
  const { user, role } = useAuth();
  return user?.id ? <Control key={`${user.id}:${role || user.role}`} role={role || user.role} /> : null;
}
