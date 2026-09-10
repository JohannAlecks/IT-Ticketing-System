import { beforeEach, describe, expect, it, vi } from 'vitest';
import { slaApi } from './sla.api';

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('./axios', () => ({ default: api }));

beforeEach(() => {
  api.get.mockReset();
  api.patch.mockReset();
});

describe('slaApi', () => {
  it('lists policy data with a cancellation signal', async () => {
    const signal = new AbortController().signal;
    api.get.mockResolvedValue({ data: { success: true, data: { policies: [], timeModel: '24/7 elapsed time' } } });

    await expect(slaApi.listPolicies(signal)).resolves.toEqual({ policies: [], timeModel: '24/7 elapsed time' });
    expect(api.get).toHaveBeenCalledWith('/sla/policies', { signal });
  });

  it('updates one policy and unwraps only the returned policy', async () => {
    const payload = { version: 2, firstResponseMinutes: 60, resolutionMinutes: 960, dueSoonMinutes: 15, isActive: true };
    api.patch.mockResolvedValue({ data: { success: true, data: { policy: { id: 'policy-1', ...payload } } } });

    await expect(slaApi.updatePolicy('policy/1', payload)).resolves.toEqual({ id: 'policy-1', ...payload });
    expect(api.patch).toHaveBeenCalledWith('/sla/policies/policy%2F1', payload);
  });
});
