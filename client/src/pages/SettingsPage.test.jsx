import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './SettingsPage';

const authState = vi.hoisted(() => ({
  user: { id: 'account-a', role: 'USER', name: 'Test User' },
  role: 'USER',
  updateUser: vi.fn(),
}));
const preferenceQuery = vi.hoisted(() => ({
  data: undefined,
  isPending: false,
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));
const preferenceMutation = vi.hoisted(() => ({
  isPending: false,
  mutateAsync: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'system', setTheme: vi.fn() }) }));
vi.mock('../api/settings.api', () => ({
  settingsApi: { updateProfile: vi.fn(), changePassword: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../hooks/useNotifications', () => ({
  NOTIFICATION_PREFERENCE_KEYS: [
    'ticketAssigned', 'ticketUnassigned', 'ticketStatusChanged', 'ticketPublicReply', 'ticketWorkBlocking',
    'knowledgeSubmitted', 'knowledgePublished', 'knowledgeReturned',
  ],
  useNotificationPreferences: () => preferenceQuery,
  useUpdateNotificationPreferences: () => preferenceMutation,
}));

const userPreferences = {
  preferences: {
    ticketStatusChanged: false,
    ticketPublicReply: true,
    accountReactivated: true,
  },
  mandatory: ['accountReactivated'],
};

function renderSettings() {
  return render(<SettingsPage />);
}

function resetQuery(data = userPreferences) {
  preferenceQuery.data = data;
  preferenceQuery.isPending = false;
  preferenceQuery.isLoading = false;
  preferenceQuery.isError = false;
  preferenceQuery.isFetching = false;
  preferenceQuery.refetch = vi.fn();
}

beforeEach(() => {
  authState.user = { id: 'account-a', role: 'USER', name: 'Test User' };
  authState.role = 'USER';
  resetQuery();
  preferenceMutation.isPending = false;
  preferenceMutation.mutateAsync.mockReset();
  vi.clearAllMocks();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => cleanup());

describe('Notifications settings', () => {
  it('renders only server-visible role controls, omits empty groups, and keeps the mandatory control on', async () => {
    renderSettings();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ticket activity' })).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Account activity' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Knowledge Base' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Ticket status changed' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Ticket public reply' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Ticket assigned' })).not.toBeInTheDocument();

    const mandatory = screen.getByRole('checkbox', { name: 'Account reactivated' });
    expect(mandatory).toBeChecked();
    expect(mandatory).toBeDisabled();
    expect(mandatory).toHaveAttribute('aria-describedby', 'notification-preference-accountReactivated-description');
    expect(screen.getByText('Always enabled')).toBeInTheDocument();
    expect(screen.getByText('Account reactivation alerts protect account integrity and cannot be turned off.')).toBeInTheDocument();
  });

  it('shows loading and retryable error states with a disabled save action', async () => {
    preferenceQuery.data = undefined;
    preferenceQuery.isPending = true;
    preferenceQuery.isLoading = true;
    renderSettings();

    expect(screen.getByRole('status')).toHaveTextContent('Loading notification preferences');
    expect(screen.getByRole('button', { name: /Save notification preferences/i })).toBeDisabled();

    cleanup();
    preferenceQuery.isPending = false;
    preferenceQuery.isLoading = false;
    preferenceQuery.isError = true;
    preferenceQuery.refetch = vi.fn();
    renderSettings();

    expect(screen.getByRole('alert')).toHaveTextContent('couldn’t load notification preferences');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(preferenceQuery.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Save notification preferences/i })).toBeDisabled();
  });

  it('enables save only after a visible optional change and reconciles the successful response', async () => {
    const saved = {
      preferences: { ticketStatusChanged: true, ticketPublicReply: true, accountReactivated: true },
      mandatory: ['accountReactivated'],
    };
    preferenceMutation.mutateAsync.mockImplementation(async (payload) => {
      expect(payload).toEqual({ ticketStatusChanged: true });
      preferenceQuery.data = saved;
      return saved;
    });
    renderSettings();

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Ticket status changed' })).toBeInTheDocument());
    const saveButton = screen.getByRole('button', { name: /Save notification preferences/i });
    expect(saveButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ticket status changed' }));
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);
    await waitFor(() => expect(preferenceMutation.mutateAsync).toHaveBeenCalledWith({ ticketStatusChanged: true }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Notification preferences saved.'));
    expect(screen.getByRole('checkbox', { name: 'Ticket status changed' })).toBeChecked();
    expect(saveButton).toBeDisabled();
  });

  it('preserves the dirty draft and exposes a retryable failure message when save fails', async () => {
    preferenceMutation.mutateAsync.mockRejectedValue(new Error('network down'));
    renderSettings();

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Ticket status changed' })).toBeInTheDocument());
    const toggle = screen.getByRole('checkbox', { name: 'Ticket status changed' });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /Save notification preferences/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Your changes are still here'));
    expect(toggle).toBeChecked();
    expect(screen.getByRole('button', { name: /Save notification preferences/i })).not.toBeDisabled();
  });

  it('does not flash prior-account controls during an account switch and uses semantic dark-mode classes', async () => {
    document.documentElement.dataset.theme = 'dark';
    const { container, rerender } = renderSettings();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Ticket status changed' })).toBeInTheDocument());
    expect(screen.getByText('These preferences control future in-app notifications. Existing notifications are not removed.')).toBeInTheDocument();

    authState.user = { id: 'account-b', role: 'USER', name: 'Other User' };
    preferenceQuery.data = undefined;
    preferenceQuery.isPending = true;
    preferenceQuery.isLoading = true;
    rerender(<SettingsPage />);

    expect(screen.queryByRole('checkbox', { name: 'Ticket status changed' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading notification preferences');
    expect(container.querySelector('section.card.lg\\:col-span-2')).toBeInTheDocument();

    preferenceQuery.data = {
      preferences: { knowledgePublished: true, accountReactivated: true },
      mandatory: ['accountReactivated'],
    };
    preferenceQuery.isPending = false;
    preferenceQuery.isLoading = false;
    rerender(<SettingsPage />);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Knowledge published' })).toBeInTheDocument());
    expect(screen.queryByRole('checkbox', { name: 'Ticket status changed' })).not.toBeInTheDocument();
  });
});
