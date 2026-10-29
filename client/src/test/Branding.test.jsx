import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import LoginPage from '../pages/LoginPage';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login: vi.fn() }) }));
afterEach(cleanup);

it('brands the login heading and descriptor without changing the sign-in contract', () => {
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Sign in to SupportFlow', exact: true })).toBeVisible();
  expect(screen.getByText('IT Support & Service Desk', { exact: true })).toBeVisible();
  expect(screen.getByLabelText('Email', { exact: true })).toHaveAttribute('name', 'email');
  expect(screen.getByRole('button', { name: 'Sign in', exact: true })).toHaveAttribute('type', 'submit');
});

it('publishes the product title and descriptor in static browser metadata', () => {
  const html = new DOMParser().parseFromString(readFileSync(resolve('index.html'), 'utf8'), 'text/html');
  expect(html.title).toBe('SupportFlow — IT Support & Service Desk');
  // DOMParser creates a detached document without the window expected by
  // jest-dom's element matcher. Check presence and the exact native values.
  const applicationName = html.querySelector('meta[name="application-name"]');
  const description = html.querySelector('meta[name="description"]');
  expect(applicationName).not.toBeNull();
  expect(description).not.toBeNull();
  expect(applicationName.getAttribute('content')).toBe('SupportFlow');
  expect(description.getAttribute('content')).toBe('IT Support & Service Desk');
});

it.each(['client', 'server', 'e2e'])('keeps %s package and lock root names synchronized', (directory) => {
  const root = resolve('..', directory);
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
  expect(pkg.name).toBe(`supportflow-${directory}`);
  expect(pkg.description).toBe('IT Support & Service Desk');
  expect(lock.name).toBe(pkg.name);
  expect(lock.packages[''].name).toBe(pkg.name);
  expect(pkg.private).toBe(true);
});
