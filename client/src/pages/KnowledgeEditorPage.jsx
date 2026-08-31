import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Input from '../components/ui/Input';
import Textarea from '../components/ui/Textarea';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import { knowledgeErrorMessage, useCreateKnowledgeArticle, useManagedKnowledgeArticle, useUpdateKnowledgeArticle } from '../hooks/useKnowledge';
import { ticketCategories } from '../constants/ticketCategories';

const blank = { title: '', summary: '', content: '', ticketCategory: 'OTHERS', visibility: 'INTERNAL', tags: '' };

function tagsFrom(value) {
  return [...new Set(String(value || '').split(',').map((tag) => tag.trim()).filter(Boolean))];
}

function fieldErrors(error) {
  const details = error?.response?.data?.details;
  return Array.isArray(details) ? Object.fromEntries(details.map((detail) => [detail.field, detail.message])) : {};
}

export default function KnowledgeEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const articleQuery = useManagedKnowledgeArticle(id);
  const create = useCreateKnowledgeArticle();
  const update = useUpdateKnowledgeArticle(id);
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [visibleError, setVisibleError] = useState('');
  useEffect(() => { if (articleQuery.data) setForm({ title: articleQuery.data.title || '', summary: articleQuery.data.summary || '', content: articleQuery.data.content || '', ticketCategory: articleQuery.data.ticketCategory || 'OTHERS', visibility: articleQuery.data.visibility || 'PUBLIC', tags: (articleQuery.data.tags || []).join(', ') }); }, [articleQuery.data]);
  if (id && articleQuery.isLoading) return <Spinner />;
  if (id && (articleQuery.isError || !articleQuery.data)) return <ErrorState message="This draft could not be loaded for editing." />;
  const save = (event) => {
    event.preventDefault();
    const clientErrors = {};
    if (form.title.trim().length < 5 || form.title.trim().length > 150) clientErrors.title = 'Title must be 5 to 150 characters.';
    if (form.summary.length > 300) clientErrors.summary = 'Summary must be 300 characters or fewer.';
    if (!form.content.trim() || form.content.length > 50000) clientErrors.content = 'Content is required and must be 50,000 characters or fewer.';
    if (Object.keys(clientErrors).length) { setErrors(clientErrors); return; }
    setErrors({}); setVisibleError('');
    const payload = { title: form.title.trim(), summary: form.summary.trim(), content: form.content, ticketCategory: form.ticketCategory, visibility: form.visibility, tags: tagsFrom(form.tags) };
    const mutation = id ? update : create;
    if (id) payload.version = articleQuery.data.version;
    mutation.mutate(payload, { onSuccess: (result) => navigate(id ? '/knowledge/manage' : `/knowledge/${result.article?.id || result.id}/edit`), onError: (error) => { setErrors(fieldErrors(error)); setVisibleError(knowledgeErrorMessage(error)); } });
  };
  const pending = create.isPending || update.isPending;
  return <div className="mx-auto max-w-3xl space-y-5"><header><Link className="text-sm font-medium text-brand-700" to="/knowledge/manage">Back to Manage Knowledge</Link><h1 className="mt-2 page-title">{id ? 'Edit knowledge draft' : 'New knowledge article'}</h1><p className="page-subtitle">Save a draft, then submit it for review. Publishing is handled through the review workflow.</p></header>{visibleError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{visibleError}</p>}<form className="card space-y-4 p-5" onSubmit={save}><Input label="Title" id="knowledge-title" name="title" minLength={5} maxLength={150} required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} error={errors.title} /><p className="-mt-3 text-right text-xs text-slate-500">{form.title.length}/150</p><Textarea label="Summary" id="knowledge-summary" name="summary" maxLength={300} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} error={errors.summary} /><p className="-mt-3 text-right text-xs text-slate-500">{form.summary.length}/300</p><Textarea label="Article content" id="knowledge-content" name="content" required maxLength={50000} className="min-h-[20rem]" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} error={errors.content} /><p className="-mt-3 text-right text-xs text-slate-500">{form.content.length.toLocaleString()}/50,000</p><div className="grid gap-4 md:grid-cols-2"><Select label="Ticket category" id="knowledge-ticket-category" value={form.ticketCategory} onChange={(event) => setForm({ ...form, ticketCategory: event.target.value })}>{ticketCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</Select><Select label="Visibility" id="knowledge-visibility" value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value })}><option value="PUBLIC">Public to all signed-in users</option><option value="INTERNAL">Internal support article</option></Select></div><Input label="Tags" id="knowledge-tags" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="vpn, password reset, access" /><p className="-mt-3 text-xs text-slate-500">Separate tags with commas. Duplicate and blank tags are removed when you save.</p><div className="flex justify-end gap-3"><Button variant="secondary" type="button" onClick={() => navigate('/knowledge/manage')}>Cancel</Button><Button type="submit" isLoading={pending}>Save draft</Button></div></form></div>;
}
