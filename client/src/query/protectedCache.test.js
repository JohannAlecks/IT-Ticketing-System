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
    client.setQueryData(['public', 'categories'], ['Hardware']);
    client.getMutationCache().build(client, {
      mutationKey: protectedMutationKeys.ticket('account-a', 'update', 'ticket-1'),
      mutationFn: async () => undefined,
    });

    await clearProtectedCache(client);

    expect(client.getQueryData(protectedQueryKeys.ticket('account-a', 'ticket-1'))).toBeUndefined();
    expect(client.getQueryData(protectedQueryKeys.ticket('account-b', 'ticket-1'))).toBeUndefined();
    expect(client.getQueryData(['public', 'categories'])).toEqual(['Hardware']);
    expect(client.getMutationCache().findAll({ mutationKey: protectedMutationKeys.ticket('account-a', 'update', 'ticket-1') })).toHaveLength(0);
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
