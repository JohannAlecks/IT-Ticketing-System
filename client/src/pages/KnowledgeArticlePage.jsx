import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ThumbsDown, ThumbsUp } from 'lucide-react';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import { TagList, VisibilityBadge, formatKnowledgeDate } from '../components/knowledge/KnowledgeBadges';
import { useKnowledgeArticle, useKnowledgeFeedback, useKnowledgeSuggestions, useRemoveKnowledgeFeedback } from '../hooks/useKnowledge';
import { useAuth } from '../context/AuthContext';

function feedbackValue(value) {
  if (value === true || value === 'HELPFUL' || value === 'helpful') return true;
  if (value === false || value === 'NOT_HELPFUL' || value === 'notHelpful' || value === 'not_helpful') return false;
  return null;
}

export default function KnowledgeArticlePage() {
  const { slug } = useParams();
  const { role } = useAuth();
  const articleQuery = useKnowledgeArticle(slug);
  const article = articleQuery.data;
  const suggestions = useKnowledgeSuggestions({ category: article?.ticketCategory, limit: 3 }, !!article?.ticketCategory);
  const feedback = useKnowledgeFeedback(article?.id);
  const removeFeedback = useRemoveKnowledgeFeedback(article?.id);
  const currentFeedback = feedbackValue(article?.viewerFeedback);
  const feedbackPending = feedback.isPending || removeFeedback.isPending;
  const isStaff = role === 'AGENT' || role === 'ADMIN';
  const changeFeedback = (helpful) => {
    if (currentFeedback === helpful) removeFeedback.mutate();
    else feedback.mutate({ helpful });
  };
  if (articleQuery.isLoading) return <Spinner />;
  if (articleQuery.isError || !article) return <ErrorState message="This article could not be loaded." />;
  const related = (suggestions.data || []).filter((item) => item.slug !== article.slug);
  return <article className="mx-auto max-w-4xl space-y-6">
    <Link to="/knowledge" className="inline-flex items-center gap-2 rounded text-sm font-medium text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500"><ArrowLeft className="h-4 w-4" /> Back to Knowledge Base</Link>
    <header className="border-b border-slate-200 pb-6"><div className="mb-3 flex flex-wrap gap-2"><VisibilityBadge visibility={article.visibility} showInternal={isStaff} /><span className="rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-800">{article.ticketCategory || 'General'}</span></div><h1 className="page-title">{article.title}</h1><p className="mt-3 text-lg text-slate-600">{article.summary}</p><div className="mt-4"><TagList tags={article.tags} /></div><p className="mt-4 text-xs text-slate-500">{article.publishedAt && `Published ${formatKnowledgeDate(article.publishedAt)}`} {article.updatedAt && ` · Updated ${formatKnowledgeDate(article.updatedAt)}`}</p></header>
    <section aria-labelledby="article-content"><h2 id="article-content" className="sr-only">Article content</h2><div className="whitespace-pre-wrap break-words text-base leading-7 text-slate-800">{article.content}</div></section>
    <section className="card p-5" aria-labelledby="article-feedback"><h2 id="article-feedback" className="text-sm font-semibold text-slate-900">Was this article helpful?</h2><p className="mt-1 text-sm text-slate-500">Your feedback helps us improve the guidance.</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant={currentFeedback === true ? 'primary' : 'secondary'} aria-pressed={currentFeedback === true} disabled={feedbackPending} isLoading={feedbackPending && currentFeedback === true} onClick={() => changeFeedback(true)}><ThumbsUp className="h-4 w-4" /> Helpful</Button><Button type="button" variant={currentFeedback === false ? 'primary' : 'secondary'} aria-pressed={currentFeedback === false} disabled={feedbackPending} isLoading={feedbackPending && currentFeedback === false} onClick={() => changeFeedback(false)}><ThumbsDown className="h-4 w-4" /> Not helpful</Button></div>{(feedback.isError || removeFeedback.isError) && <p role="alert" className="mt-3 text-sm text-red-700">We couldn't save your feedback. Please try again.</p>}</section>
    <section aria-labelledby="related-articles"><h2 id="related-articles" className="text-lg font-semibold text-slate-900">Related articles</h2>{suggestions.isLoading && <p className="mt-2 text-sm text-slate-500">Loading related articles…</p>}{!suggestions.isLoading && related.length === 0 && <p className="mt-2 text-sm text-slate-500">No related articles are available.</p>}{related.length > 0 && <ul className="mt-3 grid gap-3 md:grid-cols-2">{related.map((item) => <li key={item.id} className="card p-4"><div className="mb-2"><VisibilityBadge visibility={item.visibility} showInternal={isStaff} /></div><Link className="font-semibold text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500" to={`/knowledge/${item.slug}`}>{item.title}</Link><p className="mt-1 text-sm text-slate-600">{item.summary}</p></li>)}</ul>}</section>
  </article>;
}
