import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ticketsApi } from './tickets.api';

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('./axios', () => ({ default: api }));

beforeEach(() => {
  api.get.mockReset();
  api.patch.mockReset();
});

describe('ticketsApi archive contract', () => {
  it('forwards the explicit archive list filter and AbortSignal', async () => {
    const signal = new AbortController().signal;
    api.get.mockResolvedValue({ data: { data: { tickets: [], pagination: { page: 1 } } } });

    await expect(ticketsApi.list({ page: 1, limit: 15, archive: 'archived' }, signal)).resolves.toEqual({ tickets: [], pagination: { page: 1 } });
    expect(api.get).toHaveBeenCalledWith('/tickets', { params: { page: 1, limit: 15, archive: 'archived' }, signal });
  });

  it.each([
    ['archive', 'ticket-1'],
    ['restore', 'ticket-1'],
  ])('sends an empty body for %s transitions', async (action, ticketId) => {
    api.patch.mockResolvedValue({ data: { data: { ticket: { id: ticketId } } } });

    await expect(ticketsApi[action](ticketId)).resolves.toEqual({ id: ticketId });
    expect(api.patch).toHaveBeenCalledWith(`/tickets/${ticketId}/${action}`, {});
  });
});
