import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SlaPolicySettings, { validateSlaPolicyDraft } from './SlaPolicySettings';

const authState = vi.hoisted(() => ({ user: { id: 'admin-1' }, role: 'ADMIN' }));
const slaState = vi.hoisted(() => ({
  query: { data: undefined, isPending: false, isLoading: false, isError: false, refetch: vi.fn() },
  mutation: { isPending: false, mutateAsync: vi.fn() },
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../../hooks/useSla', () => ({
  useSlaPolicies: () => slaState.query,
  useUpdateSlaPolicy: () => slaState.mutation,
}));

const policy = {
  id: 'policy-high',
  name: 'High priority',
  priority: 'HIGH',
  firstResponseMinutes: 60,
  resolutionMinutes: 960,
  dueSoonMinutes: 15,
  isActive: true,
  version: 3,
};

function renderPolicies() {
  return render(<SlaPolicySettings />);
}

beforeEach(() => {
  authState.user = { id: 'admin-1' };
  authState.role = 'ADMIN';
  slaState.query = { data: { policies: [policy], timeModel: '24/7 elapsed time' }, isPending: false, isLoading: false, isError: false, refetch: vi.fn() };
  slaState.mutation = { isPending: false, mutateAsync: vi.fn() };
});

afterEach(() => cleanup());

describe('SlaPolicySettings', () => {
  it('validates integer bounds and cross-field targets', () => {
    expect(validateSlaPolicyDraft({ firstResponseMinutes: '60', resolutionMinutes: '30', dueSoonMinutes: '15' })).toMatchObject({ resolutionMinutes: expect.any(String) });
    expect(validateSlaPolicyDraft({ firstResponseMinutes: '60', resolutionMinutes: '960', dueSoonMinutes: '60' })).toMatchObject({ dueSoonMinutes: expect.any(String) });
    expect(validateSlaPolicyDraft({ firstResponseMinutes: '60.5', resolutionMinutes: '960', dueSoonMinutes: '15' })).toMatchObject({ firstResponseMinutes: expect.any(String) });
    expect(validateSlaPolicyDraft({ firstResponseMinutes: '60', resolutionMinutes: '960', dueSoonMinutes: '15' })).toEqual({});
  });

  it('renders the Admin-only policy form with future-ticket and time-model guidance', async () => {
    renderPolicies();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'SLA policies' })).toBeInTheDocument());
    expect(screen.getByText(/Time is measured as 24\/7 elapsed time/)).toBeInTheDocument();
    expect(screen.getByText('Existing ticket snapshots are unchanged.')).toBeInTheDocument();
    expect(screen.getByLabelText('First response (minutes)')).toHaveValue(60);
    expect(screen.getByLabelText('Resolution (minutes)')).toHaveValue(960);
    expect(screen.getByLabelText('Due soon (minutes)')).toHaveValue(15);
  });

  it('blocks invalid saves and submits the strict versioned policy payload', async () => {
    slaState.mutation.mutateAsync.mockResolvedValue({ ...policy, firstResponseMinutes: 30, version: 4 });
    renderPolicies();
    await waitFor(() => expect(screen.getByLabelText('First response (minutes)')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Due soon (minutes)'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save HIGH policy' }));
    expect(slaState.mutation.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Review the highlighted SLA values before saving.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Due soon (minutes)'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('First response (minutes)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save HIGH policy' }));
    await waitFor(() => expect(slaState.mutation.mutateAsync).toHaveBeenCalledWith({
      id: 'policy-high',
      payload: {
        version: 3,
        firstResponseMinutes: 30,
        resolutionMinutes: 960,
        dueSoonMinutes: 15,
        isActive: true,
      },
    }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('SLA policy saved.'));
  });

  it('keeps edits visible and refreshes after an optimistic-concurrency conflict', async () => {
    slaState.mutation.mutateAsync.mockRejectedValue({ response: { status: 409 } });
    renderPolicies();
    await waitFor(() => expect(screen.getByLabelText('First response (minutes)')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('First response (minutes)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save HIGH policy' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('changed in another administrator session'));
    expect(slaState.query.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('First response (minutes)')).toHaveValue(30);
  });

  it('renders no policy settings for an Agent', () => {
    authState.role = 'AGENT';
    renderPolicies();
    expect(screen.queryByRole('heading', { name: 'SLA policies' })).not.toBeInTheDocument();
  });
});
