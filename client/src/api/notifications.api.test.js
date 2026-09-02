import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationsApi } from './notifications.api';

const getMock = vi.hoisted(() => vi.fn());
const patchMock = vi.hoisted(() => vi.fn());
vi.mock('./axios', () => ({ default: { get: getMock, patch: patchMock } }));

beforeEach(() => vi.clearAllMocks());

describe('notification preferences API', () => {
  it('gets preferences from the protected endpoint and forwards AbortSignal', async () => {
    const signal = new AbortController().signal;
    const data = { preferences: { ticketStatusChanged: true }, mandatory: ['accountReactivated'] };
    getMock.mockResolvedValueOnce({ data: { success: true, data } });

    await expect(notificationsApi.getPreferences(signal)).resolves.toEqual(data);
    expect(getMock).toHaveBeenCalledWith('/notifications/preferences', { signal });
  });

  it('patches only the caller-provided preference changes and unwraps the response', async () => {
    const payload = { ticketPublicReply: false, knowledgePublished: true };
    const data = { preferences: { ticketPublicReply: false, knowledgePublished: true }, mandatory: ['accountReactivated'] };
    patchMock.mockResolvedValueOnce({ data: { success: true, data } });

    await expect(notificationsApi.updatePreferences(payload)).resolves.toEqual(data);
    expect(patchMock).toHaveBeenCalledWith('/notifications/preferences', payload);
  });
});
