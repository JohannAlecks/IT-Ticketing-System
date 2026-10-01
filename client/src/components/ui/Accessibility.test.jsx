import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import Input from './Input';
import Textarea from './Textarea';
import Select from './Select';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import FormErrors from './FormErrors';
import ReportsTable from '../reports/ReportsTable';
afterEach(cleanup);
it('report scroll region has a distinct landmark name from its surrounding report section', () => {
  render(<MemoryRouter><section aria-label="Detailed report table"><ReportsTable rows={[]} isAdmin={false} /></section></MemoryRouter>);
  expect(screen.getAllByRole('region', { name: 'Detailed report table', exact: true })).toHaveLength(1);
  expect(screen.getByRole('region', { name: 'Scrollable ticket report', exact: true })).toHaveAttribute('tabindex', '0');
});
it('required label lookup stays exact while the visual marker and native requirement remain', () => {
  render(<><Input label="Name" required /><Select label="Role" required><option>User</option></Select><Textarea label="Details" required /></>);
  for (const label of ['Name', 'Role', 'Details']) expect(screen.getByLabelText(label, { exact: true })).toBeRequired();
  expect(screen.getAllByText('*')).toHaveLength(3);
});
it('submission errors receive focus and link to the invalid field without duplicate alerts', () => {
  render(<><FormErrors errors={{ name: 'Enter your name' }} fields={{ name: 'name' }} /><Input id="name" label="Name" error="Enter your name" /></>);
  expect(screen.getByLabelText('Please correct the form errors')).toHaveFocus();
  fireEvent.click(screen.getByRole('link', { name: 'Enter your name' })); expect(screen.getByLabelText('Name')).toHaveFocus();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('textarea generates a unique label and associates instructions and errors', () => {
  render(<><Textarea label="Comment" helperText="Public reply" error="Enter a comment" required /><Textarea label="Notes" /></>);
  const field = screen.getByRole('textbox', { name: 'Comment' });
  expect(field).toHaveAttribute('aria-invalid', 'true'); expect(field).toBeRequired();
  expect(field).toHaveAccessibleDescription(/Public reply/); expect(field).toHaveAccessibleDescription(/Enter a comment/);
  expect(field.id).not.toBe(screen.getByRole('textbox', { name: 'Notes' }).id);
});
it('input preserves caller instructions as well as errors', () => {
  render(<><p id="external">Use your work address</p><Input label="Email" aria-describedby="external" helperText="Required for support" error="Invalid address" /></>);
  const field = screen.getByRole('textbox', { name: 'Email' });
  expect(field).toHaveAccessibleDescription(/Use your work address/); expect(field).toHaveAccessibleDescription(/Invalid address/); expect(field).toHaveAccessibleDescription(/Required for support/);
});
it('select connects its error and label without redundant widget roles', () => {
  render(<Select label="Department" error="Select a department" required><option value="">Choose</option></Select>);
  expect(screen.getByRole('combobox', { name: 'Department' })).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('combobox', { name: 'Department' })).toHaveAccessibleDescription('Select a department');
});
it('navigation styled as a button is one native link, not nested interactive elements', () => {
  render(<MemoryRouter><Button as={Link} to="/tickets">Tickets</Button></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Tickets' })).toHaveAttribute('href', '/tickets');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('confirmation describes its consequence and restores its connected trigger', async () => {
  const cancel = vi.fn(); const trigger = document.createElement('button'); document.body.appendChild(trigger); trigger.focus();
  const { unmount } = render(<ConfirmDialog open title="Delete view?" description="Tickets remain unchanged." onCancel={cancel} onConfirm={vi.fn()} />);
  expect(screen.getByRole('dialog', { name: 'Delete view?' })).toHaveAccessibleDescription('Tickets remain unchanged.');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true })); expect(cancel).toHaveBeenCalledOnce();
  unmount(); await waitFor(() => expect(trigger).toHaveFocus()); trigger.remove();
});
