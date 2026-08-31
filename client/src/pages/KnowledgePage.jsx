import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Search } from 'lucide-react';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import KnowledgePagination from '../components/knowledge/KnowledgePagination';
import { TagList, VisibilityBadge, formatKnowledgeDate } from '../components/knowledge/KnowledgeBadges';
import { useKnowledgeList } from '../hooks/useKnowledge';
import { ticketCategories } from '../constants/ticketCategories';
import { useAuth } from '../context/AuthContext';

const defaults = { search: '', category: '', sort: 'published', page: 1, limit: 12 };

export default function KnowledgePage() {
  const { role } = useAuth();
  const [draft, setDraft] = useState(defaults);
  const [filters, setFilters] = useState(defaults);
  const { data, isLoading, isError } = useKnowledgeList(filters);
  const isStaff = role === 'AGENT' || role === 'ADMIN';
  const articles = data?.articles || [];
  const updateDraft = (event) => setDraft((current) => ({ ...current, [event.target.name]: event.target.value }));

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="page-title">Knowledge Base</h1><p className="page-subtitle">Clear, trusted guidance for common support questions.</p></div>
      {isStaff && <Link to="/knowledge/manage"><Button variant="secondary">Manage Knowledge</Button></Link>}
    </header>
    <form className="card grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_12rem_10rem_auto_auto]" onSubmit={(event) => { event.preventDefault(); setFilters({ ...draft, page: 1 }); }}>
      <Input label="Search knowledge" id="knowledge-search" name="search" value={draft.search} onChange={updateDraft} placeholder="Search titles, summaries, or tags" />
      <Select label="Category" id="knowledge-category" name="category" value={draft.category} onChange={updateDraft}><option value="">All categories</option>{ticketCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</Select>
      <Select label="Sort" id="knowledge-sort" name="sort" value={draft.sort} onChange={updateDraft}><option value="published">Recently published</option><option value="updated">Recently updated</option></Select>
      <Button className="self-end" type="submit"><Search className="h-4 w-4" /> Apply</Button>
      <Button className="self-end" type="button" variant="secondary" onClick={() => { setDraft(defaults); setFilters(defaults); }}>Reset</Button>
    </form>
    {isLoading && <Spinner />}
    {isError && <ErrorState message="Couldn't load Knowledge Base articles. Please try again." />}
    {!isLoading && !isError && articles.length === 0 && <EmptyState icon={BookOpen} title="No articles found" description="Try a different search or category." />}
    {articles.length > 0 && <><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{articles.map((article) => <article key={article.id} className="card flex min-w-0 flex-col p-5"><div className="flex flex-wrap gap-2"><VisibilityBadge visibility={article.visibility} showInternal={isStaff} /><span className="rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-800">{article.ticketCategory || 'General'}</span></div><h2 className="mt-3 text-lg font-semibold text-slate-900"><Link className="rounded focus:outline-none focus:ring-2 focus:ring-brand-500" to={`/knowledge/${article.slug}`}>{article.title}</Link></h2><p className="mt-2 line-clamp-3 text-sm text-slate-600">{article.summary}</p><div className="mt-4"><TagList tags={article.tags} /></div><p className="mt-auto pt-4 text-xs text-slate-500">{formatKnowledgeDate(article.updatedAt || article.publishedAt) ? `Updated ${formatKnowledgeDate(article.updatedAt || article.publishedAt)}` : 'Knowledge article'}</p></article>)}</div><KnowledgePagination pagination={data?.pagination} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} /></>}
  </div>;
}
