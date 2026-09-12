import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DepartmentPicker from './DepartmentPicker';
vi.mock('../../hooks/useDepartments', () => ({ useDepartments: () => ({ data: { departments: [{ id: 'active', name: 'Active team' }], pagination: { totalPages: 2 } } }) }));
afterEach(cleanup);
it('retains only its current inactive option and has no free-text Other value', () => {
  const change = vi.fn(); render(<DepartmentPicker value="old" current={{ id: 'old', name: 'Legacy team', isActive: false }} onChange={change} />);
  expect(screen.getByRole('option', { name: 'Legacy team (inactive)' })).toBeInTheDocument(); expect(screen.queryByRole('option', { name: 'Other' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'active' } }); expect(change).toHaveBeenCalledWith('active', expect.objectContaining({ id: 'active' }));
  expect(screen.getByRole('button', { name: 'Next options' })).toBeEnabled();
});
