import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SearchPage, { parseSearchUrl } from './SearchPage';
const state = vi.hoisted(() => ({ role: 'USER', query: {}, params: null, enabled: null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' }, role: state.role }) }));
vi.mock('../hooks/useSearch', async (original) => ({ ...(await original()), useSearch: (params, mode, enabled) => { state.params = params; state.enabled = enabled; return state.query; } }));
beforeEach(() => { state.role = 'USER'; state.query = { data: { groups: [] }, refetch: vi.fn() }; });
afterEach(cleanup);
function Location() { const l = useLocation(); return <span data-testid="location">{l.search}</span>; }
function setup(url = '/search?q=vpn') { return render(<MemoryRouter initialEntries={[url]}><SearchPage /><Location /></MemoryRouter>); }
it.each(['q=x', 'q=%00ab', 'q=ok&type=users', 'q=ok&page=101', 'q=ok&pageSize=50', 'q=ok&includeArchived=yes', 'q=ok&unknown=true', 'q=ok&q=other'])('invalid URL never requests search: %s', (query) => {
  setup(`/search?${query}`); expect(state.enabled).toBe(false); expect(screen.getByRole('alert')).toHaveTextContent('valid');
});
it('defaults archives off and updates result-type/archive/page URL state', () => {
  state.query.data.groups = [{ type: 'tickets', results: [], hasMore: true }]; setup();
  expect(screen.getByLabelText('Include Archived')).not.toBeChecked(); expect(screen.queryByRole('option', { name: 'Users' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Result type'), { target: { value: 'tickets' } }); fireEvent.click(screen.getByLabelText('Include Archived'));
  fireEvent.click(screen.getByText('Next page')); expect(state.params).toMatchObject({ q: 'vpn', type: 'tickets', includeArchived: true, page: 2 });
  expect(screen.getByTestId('location')).toHaveTextContent('page=2'); fireEvent.click(screen.getByText('Previous page')); expect(state.params.page).toBe(1);
});
it('Admin user filter is authorized, URL is bounded and submit preserves the selected type', () => {
  state.role = 'ADMIN'; setup('/search?q=vpn&type=users');
  expect(screen.getByLabelText('Result type')).toHaveValue('users');
  fireEvent.change(screen.getByLabelText('Search query'), { target: { value: 'other' } }); fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(state.params).toMatchObject({ q: 'other', type: 'users', page: 1 });
  expect(parseSearchUrl(new URLSearchParams('q=ok&pageSize=20&page=100'), 'ADMIN').valid).toBe(true);
});
it('loading/error retry and no-results guidance are safe', () => {
  state.query = { isFetching: true, isError: true, refetch: vi.fn() }; setup();
  expect(screen.getByRole('status')).toHaveTextContent('Searching'); fireEvent.click(screen.getByText('Retry search')); expect(state.query.refetch).toHaveBeenCalled();
});
it('renders result groups using safe internal routes and refuses arbitrary knowledge URLs', () => {
  state.query.data.groups = [{ type: 'knowledge', results: [{ id: 'one', type: 'knowledge', title: 'Safe', subtitle: '<b>Text</b>', path: '/knowledge/safe' }, { id: 'two', type: 'knowledge', title: 'Unsafe', path: '//external.test' }] }];
  setup(); expect(screen.getByRole('link', { name: /Safe/ })).toHaveAttribute('href', '/knowledge/safe'); expect(screen.queryByText('Unsafe')).not.toBeInTheDocument();
  expect(screen.getByText('<b>Text</b>')).toBeInTheDocument();
});
