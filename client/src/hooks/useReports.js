import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../api/reports.api';
import { useAuth } from '../context/AuthContext';
import { protectedQueryKeys } from '../query/protectedCache';

export const REPORT_PAGE_LIMIT = 15;
export const REPORT_DEFAULT_SORT_ORDER = 'desc';

const SUMMARY_ONLY_KEYS = new Set(['page', 'limit', 'sortOrder']);
const EXPORT_OMITTED_KEYS = new Set(['page', 'limit']);

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || undefined;
}

function normalizeEnum(value, allowed) {
  const normalized = normalizeText(value)?.toLowerCase();
  return normalized && allowed.includes(normalized) ? normalized : undefined;
}

function normalizeUpperEnum(value, allowed) {
  const normalized = normalizeText(value)?.toUpperCase();
  return normalized && allowed.includes(normalized) ? normalized : undefined;
}

/**
 * Produce the only object shape used by report query keys and requests.
 * Empty draft values are intentionally omitted, while semantic defaults are
 * explicit so equivalent filter forms share one cache entry.
 */
export function normalizeReportFilters(filters = {}, { includeAdminFilters = true } = {}) {
  const source = filters || {};
  const normalized = {};
  const from = normalizeText(source.from);
  const to = normalizeText(source.to);
  if (from) normalized.from = from;
  if (to) normalized.to = to;

  const status = normalizeUpperEnum(source.status, ['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED']);
  const category = normalizeText(source.category)?.toUpperCase();
  const priority = normalizeUpperEnum(source.priority, ['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
  const workBlocking = normalizeEnum(source.workBlocking, ['all', 'yes', 'no']) || 'all';
  const interval = normalizeEnum(source.interval, ['day', 'week', 'month']) || 'day';
  if (status) normalized.status = status;
  if (category) normalized.category = category;
  if (priority) normalized.priority = priority;
  normalized.workBlocking = workBlocking;
  normalized.interval = interval;

  if (includeAdminFilters) {
    const department = normalizeText(source.department);
    const agentId = normalizeText(source.agentId);
    if (department) normalized.department = department;
    if (agentId) normalized.agentId = agentId;
  }

  const search = normalizeText(source.search);
  if (search) normalized.search = search;

  if (Number.isFinite(Number(source.page))) {
    const page = Math.max(1, Math.floor(Number(source.page)));
    normalized.page = page;
  }
  if (Number.isFinite(Number(source.limit))) {
    const limit = Math.max(1, Math.floor(Number(source.limit)));
    normalized.limit = limit;
  }
  const sortOrder = normalizeEnum(source.sortOrder, ['asc', 'desc']);
  if (sortOrder) normalized.sortOrder = sortOrder;

  return normalized;
}

export function normalizeReportSummaryFilters(filters = {}, options) {
  const normalized = normalizeReportFilters(filters, options);
  return Object.fromEntries(Object.entries(normalized).filter(([key]) => !SUMMARY_ONLY_KEYS.has(key)));
}

export function normalizeReportExportFilters(filters = {}, options) {
  const normalized = normalizeReportFilters(filters, options);
  return Object.fromEntries(Object.entries(normalized).filter(([key]) => !EXPORT_OMITTED_KEYS.has(key)));
}

export function getAuthorizedReportFilters(filters, role, mode = 'summary') {
  const includeAdminFilters = String(role || '').toUpperCase() === 'ADMIN';
  if (mode === 'tickets') return normalizeReportFilters(filters, { includeAdminFilters });
  if (mode === 'export') return normalizeReportExportFilters(filters, { includeAdminFilters });
  return normalizeReportSummaryFilters(filters, { includeAdminFilters });
}

function canAccessReports(role) {
  const normalizedRole = String(role || '').toUpperCase();
  return normalizedRole === 'AGENT' || normalizedRole === 'ADMIN';
}

function reportRoleKey(role) {
  return String(role || '').toUpperCase();
}

function sameReportAccessScope(previousQuery, userId, roleKey) {
  const previousKey = previousQuery?.queryKey || [];
  const reportRoot = protectedQueryKeys.reports(userId);
  return reportRoot.every((part, index) => previousKey[index] === part) &&
    previousKey[reportRoot.length] === roleKey && previousKey[reportRoot.length + 1] === 'tickets';
}

export function useReportSummary(filters) {
  const { user, role } = useAuth();
  const userId = user?.id;
  const roleKey = reportRoleKey(role);
  const normalizedFilters = getAuthorizedReportFilters(filters, role, 'summary');
  return useQuery({
    queryKey: [...protectedQueryKeys.reports(userId), roleKey, 'summary', normalizedFilters],
    queryFn: ({ signal }) => reportsApi.getSummary(normalizedFilters, signal),
    enabled: !!userId && canAccessReports(role),
  });
}

export function useReportTickets(filters) {
  const { user, role } = useAuth();
  const userId = user?.id;
  const roleKey = reportRoleKey(role);
  const normalizedFilters = getAuthorizedReportFilters(filters, role, 'tickets');
  return useQuery({
    queryKey: [...protectedQueryKeys.reports(userId), roleKey, 'tickets', normalizedFilters],
    queryFn: ({ signal }) => reportsApi.getTickets(normalizedFilters, signal),
    enabled: !!userId && canAccessReports(role),
    placeholderData: (previous, previousQuery) =>
      sameReportAccessScope(previousQuery, userId, roleKey) ? previous : undefined,
  });
}

export function useReports(filters) {
  const summaryQuery = useReportSummary(filters);
  const ticketsQuery = useReportTickets({
    page: filters?.page || 1,
    limit: filters?.limit || REPORT_PAGE_LIMIT,
    sortOrder: filters?.sortOrder || REPORT_DEFAULT_SORT_ORDER,
    ...filters,
  });

  return { summaryQuery, ticketsQuery, summary: summaryQuery, tickets: ticketsQuery };
}
