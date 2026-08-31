import { beforeEach, describe, expect, it, vi } from 'vitest';
import { knowledgeApi } from './knowledge.api';

const getMock = vi.hoisted(() => vi.fn());
const postMock = vi.hoisted(() => vi.fn());
const patchMock = vi.hoisted(() => vi.fn());
const putMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());
vi.mock('./axios', () => ({ default: { get: getMock, post: postMock, patch: patchMock, put: putMock, delete: deleteMock } }));

beforeEach(() => vi.clearAllMocks());

describe('knowledgeApi', () => {
  it('unwraps protected reads and forwards AbortSignal', async () => {
    const signal = new AbortController().signal;
    getMock.mockResolvedValueOnce({ data: { success: true, data: { articles: [] } } });
    getMock.mockResolvedValueOnce({ data: { success: true, data: { article: { id: 'a1' } } } });
    await expect(knowledgeApi.list({ scope: 'read', page: 1 }, signal)).resolves.toEqual({ articles: [] });
    await expect(knowledgeApi.getBySlug('vpn guide', signal)).resolves.toEqual({ article: { id: 'a1' } });
    expect(getMock).toHaveBeenNthCalledWith(1, '/knowledge', { params: { scope: 'read', page: 1 }, signal });
    expect(getMock).toHaveBeenNthCalledWith(2, '/knowledge/vpn%20guide', { signal });
  });

  it('sends versioned workflow and feedback payloads to the frozen endpoints', async () => {
    patchMock.mockResolvedValue({ data: { success: true, data: { article: { id: 'a1' } } } });
    putMock.mockResolvedValue({ data: { success: true, data: { viewerFeedback: true } } });
    await knowledgeApi.returnToDraft('a1', 7, 'Please add steps');
    await knowledgeApi.setFeedback('a1', true);
    expect(patchMock).toHaveBeenCalledWith('/knowledge/a1/return-to-draft', { version: 7, reviewNote: 'Please add steps' });
    expect(putMock).toHaveBeenCalledWith('/knowledge/a1/feedback', { helpful: true });
  });
});
