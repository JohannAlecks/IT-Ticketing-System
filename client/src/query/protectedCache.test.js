import { QueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clearProtectedCache, protectedMutationKeys, protectedQueryKeys } from './protectedCache';

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('protected cache ownership', () => {
  it('isolates accounts while preserving public data', async () => {
    const client = makeClient();
    client.setQueryData(protectedQueryKeys.ticket('account-a', 'ticket-1'), { owner: 'a' });
    client.setQueryData(protectedQueryKeys.ticket('account-b', 'ticket-1'), { owner: 'b' });
    client.setQueryData([...protectedQueryKeys.reports('account-a'), 'AGENT', 'summary', { from: '2026-08-01', to: '2026-08-30' }], { owner: 'a' });
    client.setQueryData([...protectedQueryKeys.reports('account-b'), 'ADMIN', 'tickets', { page: 1 }], { owner: 'b' });
    client.setQueryData([...protectedQueryKeys.knowledge('account-a', 'USER'), 'detail', 'safe-guide'], { owner: 'a' });
    client.setQueryData(['public', 'categories'], ['Hardware']);
    client.getMutationCache().build(client, {
      mutationKey: protectedMutationKeys.ticket('account-a', 'update', 'ticket-1'),
      mutationFn: async () => undefined,
    });

    await clearProtectedCache(client);

    expect(client.getQueryData(protectedQueryKeys.ticket('account-a', 'ticket-1'))).toBeUndefined();
    expect(client.getQueryData(protectedQueryKeys.ticket('account-b', 'ticket-1'))).toBeUndefined();
    expect(client.getQueryData([...protectedQueryKeys.reports('account-a'), 'AGENT', 'summary', { from: '2026-08-01', to: '2026-08-30' }])).toBeUndefined();
    expect(client.getQueryData([...protectedQueryKeys.reports('account-b'), 'ADMIN', 'tickets', { page: 1 }])).toBeUndefined();
    expect(client.getQueryData([...protectedQueryKeys.knowledge('account-a', 'USER'), 'detail', 'safe-guide'])).toBeUndefined();
    expect(client.getQueryData(['public', 'categories'])).toEqual(['Hardware']);
    expect(client.getMutationCache().findAll({ mutationKey: protectedMutationKeys.ticket('account-a', 'update', 'ticket-1') })).toHaveLength(0);
  });

  it('keeps reports under the protected account root with explicit summary and tickets suffixes', () => {
    expect(protectedQueryKeys.reports('account-a')).toEqual(['protected', 'account-a', 'reports']);
    expect([...protectedQueryKeys.reports('account-a'), 'AGENT', 'summary', { interval: 'day' }]).toEqual([
      'protected',
      'account-a',
      'reports',
      'AGENT',
      'summary',
      { interval: 'day' },
    ]);
    expect([...protectedQueryKeys.reports('account-a'), 'ADMIN', 'tickets', { page: 1 }]).toEqual([
      'protected',
      'account-a',
      'reports',
      'ADMIN',
      'tickets',
      { page: 1 },
    ]);
  });

  it('separates Knowledge cache roots by role as well as account', () => {
    expect(protectedQueryKeys.knowledge('account-a', 'user')).toEqual(['protected', 'account-a', 'knowledge', 'USER']);
    expect(protectedQueryKeys.knowledge('account-a', 'ADMIN')).toEqual(['protected', 'account-a', 'knowledge', 'ADMIN']);
  });

  it('aborts and removes an in-flight protected query', async () => {
    const client = makeClient();
    let requestSignal;
    const request = client.fetchQuery({
      queryKey: protectedQueryKeys.ticket('account-a', 'ticket-1'),
      queryFn: ({ signal }) => new Promise(() => { requestSignal = signal; }),
    }).catch(() => undefined);

    await waitFor(() => expect(requestSignal).toBeDefined());
    await clearProtectedCache(client);
    await request;

    expect(requestSignal.aborted).toBe(true);
    expect(client.getQueryData(protectedQueryKeys.ticket('account-a', 'ticket-1'))).toBeUndefined();
  });
});
