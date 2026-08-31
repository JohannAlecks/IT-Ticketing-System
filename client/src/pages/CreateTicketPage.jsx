import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Input from '../components/ui/Input';
import Textarea from '../components/ui/Textarea';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import { useCreateTicket } from '../hooks/useTickets';
import { categoryDescriptionGuidance, categorySuggestions, hasCredentialWarning, ticketCategories } from '../constants/ticketCategories';
import { useAuth } from '../context/AuthContext';
import { useKnowledgeSuggestions } from '../hooks/useKnowledge';

function usefulSuggestionTerm(title) {
  const term = title.trim().replace(/\s+/g, ' ');
  if (term.length < 8 || term.split(' ').length < 2) return undefined;
  return term.slice(0, 80);
}

const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export default function CreateTicketPage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const canTriage = role === 'AGENT' || role === 'ADMIN';
  const { mutate, isPending } = useCreateTicket();
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    category: 'OTHERS',
    isWorkBlocking: false,
    impactDescription: '',
  });
  const [errors, setErrors] = useState({});
  const suggestionTerm = usefulSuggestionTerm(form.title);
  const knowledgeSuggestions = useKnowledgeSuggestions({ category: form.category, search: suggestionTerm, limit: 3 });

  const handleChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm({ ...form, [e.target.name]: value, ...(e.target.name === 'isWorkBlocking' && !value ? { impactDescription: '' } : {}) });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors({});
    mutate(form, {
      onSuccess: (ticket) => navigate(`/tickets/${ticket.id}`),
      onError: (err) => {
        const details = err.response?.data?.details;
        if (details) setErrors(Object.fromEntries(details.map((d) => [d.field, d.message])));
      },
    });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold text-gray-900">Create a new ticket</h1>
      <p className="mb-6 text-sm text-gray-500">Describe your issue and we'll route it to the right team.</p>

      <form onSubmit={handleSubmit} className="card space-y-4 p-6">
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Submit one issue per ticket so our support team can track and resolve it accurately.</p>
        <p className="text-sm text-slate-500">Requester department: <strong>{user?.department || 'Not specified'}</strong></p>
        <Select label="Category" id="category" name="category" value={form.category} onChange={handleChange}>
          {ticketCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
        </Select>
        <div><p className="mb-2 text-xs font-semibold text-slate-500">Suggested titles</p><div className="flex flex-wrap gap-2">{categorySuggestions(form.category).map((suggestion) => <button type="button" key={suggestion} onClick={() => setForm({ ...form, title: suggestion })} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-brand-50">{suggestion}</button>)}</div></div>
        <Input
          label="Title"
          id="title"
          name="title"
          placeholder="Brief summary of the issue"
          required
          value={form.title}
          onChange={handleChange}
          error={errors.title}
        />
        {knowledgeSuggestions.data?.length > 0 && <section aria-labelledby="knowledge-suggestions" className="rounded-xl border border-brand-100 bg-brand-50/40 p-3"><h2 id="knowledge-suggestions" className="text-sm font-semibold text-slate-800">Helpful Knowledge Base articles</h2><ul className="mt-2 space-y-1.5">{knowledgeSuggestions.data.map((article) => <li key={article.id}><a className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-500" href={`/knowledge/${article.slug}`} target="_blank" rel="noopener noreferrer">{article.title}</a>{canTriage && article.visibility === 'INTERNAL' && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">Internal</span>}</li>)}</ul></section>}
        {knowledgeSuggestions.isSuccess && knowledgeSuggestions.data?.length === 0 && <p role="status" className="text-sm text-slate-500">No related Knowledge Base articles found for this category.</p>}
        <Textarea
          label="Description"
          id="description"
          name="description"
          placeholder="Provide as much detail as possible..."
          required
          value={form.description}
          onChange={handleChange}
          error={errors.description}
        />
        {!canTriage && <><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700"><input className="mt-0.5 h-4 w-4 accent-emerald-600" type="checkbox" name="isWorkBlocking" checked={form.isWorkBlocking} onChange={handleChange} /><span><span className="block font-semibold">This issue is preventing me from working</span><span className="mt-1 block text-slate-500">Select this only if you cannot continue your work and no reasonable workaround is available.</span></span></label>{form.isWorkBlocking && <Textarea label="How is this blocking your work?" id="impactDescription" name="impactDescription" placeholder="Explain what you cannot do, whether a workaround exists, and whether other employees are affected." required value={form.impactDescription} onChange={handleChange} error={errors.impactDescription} />}<p className="text-sm text-slate-500">Support will assess the final priority based on impact, affected users, security risk, and available workarounds.</p></>}
        <section aria-labelledby="description-guidance" className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><h2 id="description-guidance" className="font-semibold text-slate-700">Helpful details to include</h2><ul className="mt-1 list-disc space-y-1 pl-5">{categoryDescriptionGuidance(form.category).map((question) => <li key={question}>{question}</li>)}</ul></section>
        {hasCredentialWarning(form.category) && <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Security reminder: Never include passwords, verification codes, recovery codes, API keys, or confidential credentials in a support ticket.</p>}
        {['help','issue','problem','broken','not working','urgent','please help',"it doesn't work",'it does not work'].includes(form.title.trim().toLowerCase()) && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Please identify the affected device, application, or specific problem.</p>}
        {canTriage && <Select label="Priority" id="priority" name="priority" value={form.priority} onChange={handleChange}>{PRIORITY_OPTIONS.map((p) => (<option key={p} value={p}>{p}</option>))}</Select>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isPending}>
            Submit Ticket
          </Button>
        </div>
      </form>
    </div>
  );
}
