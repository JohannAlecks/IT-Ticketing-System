import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2, Pencil, Send, Archive, RotateCcw, CheckCircle2, Undo2 } from 'lucide-react';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import { StatusBadge, VisibilityBadge, TagList, formatKnowledgeDate } from '../components/knowledge/KnowledgeBadges';
import { knowledgeErrorMessage, useKnowledgeFeedbackSummary, useKnowledgeList, useKnowledgeWorkflow } from '../hooks/useKnowledge';
import { useAuth } from '../context/AuthContext';

const tabs = [
  { key: 'DRAFT', label: 'My Drafts' },
  { key: 'IN_REVIEW', label: 'In Review' },
  { key: 'PUBLISHED', label: 'Published' },
];

function actionFor(article, role) {
  if (article.status === 'DRAFT') return { action: 'submit', label: 'Submit for review', icon: Send, description: 'Submit this draft for review?' };
  if (article.status === 'IN_REVIEW' && role === 'ADMIN') return { action: 'publish', label: 'Publish', icon: CheckCircle2, description: 'Publish this article for readers?' };
  if (article.status === 'PUBLISHED' && role === 'ADMIN') return { action: 'archive', label: 'Archive', icon: Archive, description: 'Archive this article? Readers will no longer see it.' };
  if (article.status === 'ARCHIVED' && role === 'ADMIN') return { action: 'restore', label: 'Republish', icon: RotateCcw, targetStatus: 'PUBLISHED', description: 'Restore this article directly to its prior published state?' };
  return null;
}

function FeedbackAggregate({ articleId, enabled }) {
  const summary = useKnowledgeFeedbackSummary(articleId);
  if (!enabled || summary.isLoading || summary.isError || !summary.data) return null;
  return <p className="mt-3 text-xs text-slate-500">Feedback: {summary.data.helpful} helpful · {summary.data.notHelpful} not helpful ({summary.data.total} total)</p>;
}

export default function KnowledgeManagePage() {
  const { role, user } = useAuth();
  const availableTabs = role === 'ADMIN'
    ? [{ ...tabs[0], label: 'Drafts' }, ...tabs.slice(1), { key: 'ARCHIVED', label: 'Archived' }]
    : tabs;
  const [tab, setTab] = useState('DRAFT');
  const [pending, setPending] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [visibleError, setVisibleError] = useState('');
  const status = tab === 'DRAFT' ? 'DRAFT' : tab;
  const query = useKnowledgeList({ status, sort: 'updated', page: 1, limit: 25 }, 'manage');
  const workflow = useKnowledgeWorkflow();
  const articles = useMemo(() => (query.data?.articles || []).filter((article) => tab !== 'DRAFT' || article.author?.id === user?.id || role === 'ADMIN'), [query.data, role, tab, user?.id]);
  const runWorkflow = (request) => {
    setVisibleError('');
    workflow.mutate(request, { onSuccess: () => { setPending(null); setReviewing(null); setReviewNote(''); }, onError: (error) => setVisibleError(knowledgeErrorMessage(error)) });
  };
  const openReturn = (article) => { setReviewing(article); setReviewNote(''); setVisibleError(''); };
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="page-title">Manage Knowledge</h1><p className="page-subtitle">Create, review, and maintain support guidance.</p></div><Link to="/knowledge/new"><Button><FilePlus2 className="h-4 w-4" /> New article</Button></Link></header>
    <div className="flex overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Knowledge status filters">{availableTabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 ${tab === item.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`} onClick={() => setTab(item.key)}>{item.label}</button>)}</div>
    {visibleError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{visibleError}</p>}
    {query.isLoading && <Spinner />}{query.isError && <ErrorState message="Couldn't load managed Knowledge Base articles." />}
    {!query.isLoading && !query.isError && articles.length === 0 && <EmptyState title={`No ${availableTabs.find((item) => item.key === tab)?.label.toLowerCase()} articles`} description="Articles will appear here when they match this workflow state." />}
    <div className="space-y-3">{articles.map((article) => {
      const action = actionFor(article, role);
      const ActionIcon = action?.icon;
      return <article key={article.id} className="card p-4">
        <div className="flex flex-col justify-between gap-4 md:flex-row">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2"><StatusBadge status={article.status} /><VisibilityBadge visibility={article.visibility} showInternal /><span className="rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-800">{article.ticketCategory || 'General'}</span></div>
            <h2 className="mt-3 text-lg font-semibold text-slate-900">{article.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{article.summary}</p>
            <div className="mt-3"><TagList tags={article.tags} /></div>
            {article.reviewNote && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-900"><strong>Review note:</strong> {article.reviewNote}</p>}
            <FeedbackAggregate articleId={article.id} enabled={role === 'ADMIN' && article.status === 'PUBLISHED'} />
            <p className="mt-3 text-xs text-slate-500">Updated {formatKnowledgeDate(article.updatedAt) || 'recently'}</p>
          </div>
          <div className="flex shrink-0 flex-wrap content-start gap-2">
            {article.status === 'DRAFT' && <Link to={`/knowledge/${article.id}/edit`}><Button variant="secondary" size="sm"><Pencil className="h-4 w-4" /> Edit</Button></Link>}
            {article.status === 'IN_REVIEW' && role === 'ADMIN' && <Button variant="secondary" size="sm" onClick={() => openReturn(article)}><Undo2 className="h-4 w-4" /> Return to draft</Button>}
            {article.status === 'ARCHIVED' && role === 'ADMIN' && <Button variant="secondary" size="sm" onClick={() => { setPending({ action: 'restore', label: 'Restore to draft', description: 'Restore this article as an editable draft?', targetStatus: 'DRAFT', article }); setVisibleError(''); }}><Undo2 className="h-4 w-4" /> Restore to draft</Button>}
            {action && <Button size="sm" variant={action.action === 'archive' ? 'danger' : 'primary'} onClick={() => { setPending({ ...action, article }); setVisibleError(''); }}><ActionIcon className="h-4 w-4" /> {action.label}</Button>}
          </div>
        </div>
      </article>;
    })}</div>
    <ConfirmDialog open={!!pending} title={pending?.label || 'Confirm action'} description={pending?.description} confirmLabel={pending?.label} danger={pending?.action === 'archive'} isLoading={workflow.isPending} onCancel={() => setPending(null)} onConfirm={() => runWorkflow({ action: pending.action, id: pending.article.id, version: pending.article.version, targetStatus: pending.targetStatus })} />
    {reviewing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onSubmit={(event) => { event.preventDefault(); if (reviewNote.trim()) runWorkflow({ action: 'return-to-draft', id: reviewing.id, version: reviewing.version, reviewNote: reviewNote.trim() }); }} aria-labelledby="return-to-draft-title"><h2 id="return-to-draft-title" className="text-lg font-semibold text-slate-900">Return to draft</h2><label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="review-note">Required review note</label><textarea id="review-note" className="input mt-1 min-h-28" required value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /><div className="mt-5 flex justify-end gap-3"><Button variant="secondary" type="button" disabled={workflow.isPending} onClick={() => setReviewing(null)}>Cancel</Button><Button type="submit" isLoading={workflow.isPending}>Return to draft</Button></div></form></div>}
  </div>;
}
