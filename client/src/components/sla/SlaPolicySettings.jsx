import { useEffect, useRef, useState } from 'react';
import { Save, TimerReset } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSlaPolicies, useUpdateSlaPolicy } from '../../hooks/useSla';
import Button from '../ui/Button';
import Input from '../ui/Input';

export const SLA_POLICY_LIMITS = Object.freeze({
  firstResponseMinutes: { min: 1, max: 43200 },
  resolutionMinutes: { min: 1, max: 525600 },
  dueSoonMinutes: { min: 1, max: 43199 },
});

function isPositiveInteger(value) {
  return /^\d+$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

export function validateSlaPolicyDraft(draft) {
  const errors = {};
  for (const [field, limits] of Object.entries(SLA_POLICY_LIMITS)) {
    if (!isPositiveInteger(draft?.[field])) {
      errors[field] = 'Enter a positive whole number.';
    } else if (Number(draft[field]) < limits.min || Number(draft[field]) > limits.max) {
      errors[field] = `Use a whole number from ${limits.min.toLocaleString()} to ${limits.max.toLocaleString()}.`;
    }
  }

  const firstResponse = Number(draft?.firstResponseMinutes);
  const resolution = Number(draft?.resolutionMinutes);
  const dueSoon = Number(draft?.dueSoonMinutes);
  if (isPositiveInteger(draft?.firstResponseMinutes) && isPositiveInteger(draft?.resolutionMinutes) && resolution < firstResponse) {
    errors.resolutionMinutes = 'Resolution must be at least the first-response target.';
  }
  if (isPositiveInteger(draft?.dueSoonMinutes) && isPositiveInteger(draft?.firstResponseMinutes) && dueSoon >= firstResponse) {
    errors.dueSoonMinutes = 'Due-soon must be smaller than the first-response target.';
  } else if (isPositiveInteger(draft?.dueSoonMinutes) && isPositiveInteger(draft?.resolutionMinutes) && dueSoon >= resolution) {
    errors.dueSoonMinutes = 'Due-soon must be smaller than the resolution target.';
  }
  return errors;
}

function draftForPolicy(policy) {
  return {
    firstResponseMinutes: String(policy.firstResponseMinutes ?? ''),
    resolutionMinutes: String(policy.resolutionMinutes ?? ''),
    dueSoonMinutes: String(policy.dueSoonMinutes ?? ''),
    isActive: Boolean(policy.isActive),
  };
}

function samePolicyDraft(policy, draft) {
  return draft && Number(draft.firstResponseMinutes) === Number(policy.firstResponseMinutes)
    && Number(draft.resolutionMinutes) === Number(policy.resolutionMinutes)
    && Number(draft.dueSoonMinutes) === Number(policy.dueSoonMinutes)
    && Boolean(draft.isActive) === Boolean(policy.isActive);
}

function PolicyEditor({ policy, draft, errors, feedback, saving, onChange, onSave }) {
  const policyLabel = policy.name || policy.priority || 'SLA';
  const formId = `sla-policy-${policy.id}`;
  const dirty = !samePolicyDraft(policy, draft);
  return (
    <form className="rounded-2xl border border-slate-200 p-4" aria-labelledby={`${formId}-heading`} onSubmit={(event) => { event.preventDefault(); onSave(policy); }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={`${formId}-heading`} className="text-base font-semibold text-slate-900">{policyLabel}</h3>
          <p className="mt-0.5 text-xs text-slate-500">Priority: {policy.priority} · Version {policy.version}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${draft?.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {draft?.isActive ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Input
          id={`${formId}-first-response`}
          label="First response (minutes)"
          type="number"
          min={SLA_POLICY_LIMITS.firstResponseMinutes.min}
          max={SLA_POLICY_LIMITS.firstResponseMinutes.max}
          step="1"
          inputMode="numeric"
          value={draft?.firstResponseMinutes || ''}
          onChange={(event) => onChange(policy.id, { firstResponseMinutes: event.target.value })}
          error={errors?.firstResponseMinutes}
          aria-invalid={Boolean(errors?.firstResponseMinutes)}
        />
        <Input
          id={`${formId}-resolution`}
          label="Resolution (minutes)"
          type="number"
          min={SLA_POLICY_LIMITS.resolutionMinutes.min}
          max={SLA_POLICY_LIMITS.resolutionMinutes.max}
          step="1"
          inputMode="numeric"
          value={draft?.resolutionMinutes || ''}
          onChange={(event) => onChange(policy.id, { resolutionMinutes: event.target.value })}
          error={errors?.resolutionMinutes}
          aria-invalid={Boolean(errors?.resolutionMinutes)}
        />
        <Input
          id={`${formId}-due-soon`}
          label="Due soon (minutes)"
          type="number"
          min={SLA_POLICY_LIMITS.dueSoonMinutes.min}
          max={SLA_POLICY_LIMITS.dueSoonMinutes.max}
          step="1"
          inputMode="numeric"
          value={draft?.dueSoonMinutes || ''}
          onChange={(event) => onChange(policy.id, { dueSoonMinutes: event.target.value })}
          error={errors?.dueSoonMinutes}
          aria-invalid={Boolean(errors?.dueSoonMinutes)}
        />
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          checked={Boolean(draft?.isActive)}
          onChange={(event) => onChange(policy.id, { isActive: event.target.checked })}
          aria-label={`Enable ${policyLabel} SLA policy`}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        Policy is active for new tickets
      </label>

      {Object.keys(errors || {}).length > 0 && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">Review the highlighted SLA values before saving.</p>}
      {feedback && <p className={`mt-3 text-sm ${feedback.type === 'error' ? 'text-red-700' : feedback.type === 'success' ? 'text-emerald-700' : 'text-slate-600'}`} role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.message}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Existing ticket snapshots are unchanged.</p>
        <Button type="submit" size="sm" disabled={!dirty || saving} isLoading={saving}>
          <Save className="h-3.5 w-3.5" /> Save {policy.priority} policy
        </Button>
      </div>
    </form>
  );
}

export default function SlaPolicySettings() {
  const { user, role } = useAuth();
  const normalizedRole = String(role || user?.role || '').toUpperCase();
  const identity = user?.id ? `${user.id}:${normalizedRole}` : '';
  const policiesQuery = useSlaPolicies();
  const policyMutation = useUpdateSlaPolicy();
  const [drafts, setDrafts] = useState({});
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState({});
  const [dirtyIds, setDirtyIds] = useState(() => new Set());
  const [loadedIdentity, setLoadedIdentity] = useState(null);
  const lastIdentity = useRef(identity);
  const activeIdentity = useRef(identity);
  activeIdentity.current = identity;

  useEffect(() => {
    if (lastIdentity.current === identity) return;
    lastIdentity.current = identity;
    setDrafts({});
    setErrors({});
    setFeedback({});
    setDirtyIds(new Set());
    setLoadedIdentity(null);
  }, [identity]);

  const policies = Array.isArray(policiesQuery.data?.policies) ? policiesQuery.data.policies : [];
  useEffect(() => {
    if (identity && policiesQuery.data && Array.isArray(policiesQuery.data.policies)) setLoadedIdentity(identity);
  }, [identity, policiesQuery.data]);

  useEffect(() => {
    if (loadedIdentity !== identity || !Array.isArray(policiesQuery.data?.policies)) return;
    setDrafts((current) => {
      const next = {};
      for (const policy of policiesQuery.data.policies) {
        next[policy.id] = dirtyIds.has(policy.id) && current[policy.id]
          ? current[policy.id]
          : draftForPolicy(policy);
      }
      return next;
    });
  }, [dirtyIds, identity, loadedIdentity, policiesQuery.data]);

  if (normalizedRole !== 'ADMIN') return null;

  const ready = loadedIdentity === identity && Boolean(policiesQuery.data);
  const loading = !policiesQuery.isError && (!ready || policiesQuery.isPending || policiesQuery.isLoading);
  const savePolicy = async (policy) => {
    const draft = drafts[policy.id] || draftForPolicy(policy);
    const nextErrors = validateSlaPolicyDraft(draft);
    setErrors((current) => ({ ...current, [policy.id]: nextErrors }));
    setFeedback((current) => ({ ...current, [policy.id]: null }));
    if (Object.keys(nextErrors).length > 0) return;

    const saveIdentity = identity;
    try {
      const updated = await policyMutation.mutateAsync({
        id: policy.id,
        payload: {
          version: policy.version,
          firstResponseMinutes: Number(draft.firstResponseMinutes),
          resolutionMinutes: Number(draft.resolutionMinutes),
          dueSoonMinutes: Number(draft.dueSoonMinutes),
          isActive: Boolean(draft.isActive),
        },
      });
      if (activeIdentity.current !== saveIdentity) return;
      setDirtyIds((current) => {
        const next = new Set(current);
        next.delete(policy.id);
        return next;
      });
      if (updated) setDrafts((current) => ({ ...current, [policy.id]: draftForPolicy(updated) }));
      setFeedback((current) => ({ ...current, [policy.id]: { type: 'success', message: 'SLA policy saved.' } }));
    } catch (error) {
      if (activeIdentity.current !== saveIdentity) return;
      const isConflict = error?.response?.status === 409;
      setFeedback((current) => ({
        ...current,
        [policy.id]: {
          type: 'error',
          message: isConflict
            ? 'This policy changed in another administrator session. Refresh the server values and try again.'
            : error?.response?.data?.message || 'Could not save this SLA policy. Your changes are still here.',
        },
      }));
      if (isConflict) void policiesQuery.refetch?.();
    }
  };

  let content;
  if (loading) {
    content = <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-5 text-sm text-slate-600" role="status" aria-live="polite">Loading SLA policies…</div>;
  } else if (policiesQuery.isError && !policiesQuery.data) {
    content = <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between" role="alert"><span>We couldn’t load SLA policies. Please try again.</span><Button type="button" variant="secondary" size="sm" onClick={() => policiesQuery.refetch?.()}>Retry</Button></div>;
  } else if (policies.length === 0) {
    content = <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">No SLA policies are configured.</p>;
  } else {
    content = <>
      {policiesQuery.isError && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert"><span>We couldn’t refresh the latest SLA policies.</span><Button type="button" variant="secondary" size="sm" onClick={() => policiesQuery.refetch?.()}>Retry</Button></div>}
      <div className="space-y-3">{policies.map((policy) => <PolicyEditor key={policy.id} policy={policy} draft={drafts[policy.id] || draftForPolicy(policy)} errors={errors[policy.id]} feedback={feedback[policy.id]} saving={policyMutation.isPending} onChange={(id, patch) => { setDrafts((current) => ({ ...current, [id]: { ...(current[id] || draftForPolicy(policy)), ...patch } })); setDirtyIds((current) => new Set(current).add(id)); setErrors((current) => ({ ...current, [id]: {} })); setFeedback((current) => ({ ...current, [id]: null })); }} onSave={savePolicy} />)}</div>
    </>;
  }

  return (
    <section id="sla-policies" className="card p-5 lg:col-span-2" aria-labelledby="sla-policy-settings-heading">
      <div className="mb-5 flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><TimerReset className="h-4 w-4" aria-hidden="true" /></div>
        <div>
          <h2 id="sla-policy-settings-heading" className="font-semibold text-slate-900">SLA policies</h2>
          <p className="mt-0.5 text-sm text-slate-500">Admin-only targets for new tickets. Time is measured as 24/7 elapsed time.</p>
        </div>
      </div>
      {content}
    </section>
  );
}
