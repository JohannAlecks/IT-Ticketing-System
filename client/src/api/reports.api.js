import api from './axios';

const DEFAULT_EXPORT_FILENAME = 'authorized-report.csv';

function responseData(response) {
  const body = response?.data;
  const data = body?.data ?? body;
  return data?.summary ?? data?.report ?? data;
}

function stripWrappingQuotes(value) {
  const text = String(value || '').trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1);
  }
  return text;
}

function decodeFilename(value) {
  const text = stripWrappingQuotes(value);
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

// Content-Disposition is server-provided input. Keep only a safe basename and
// force a CSV extension so a response cannot choose a path or executable name.
export function sanitizeReportFilename(value, fallback = DEFAULT_EXPORT_FILENAME) {
  const fallbackName = String(fallback || DEFAULT_EXPORT_FILENAME)
    .replace(/[\\/:*?"<>|\u0000-\u001F\u007F]+/g, '-')
    .trim() || DEFAULT_EXPORT_FILENAME;
  const source = String(value || '').replace(/[\\/:*?"<>|\u0000-\u001F\u007F]+/g, '-').trim();
  const safe = (source || fallbackName).slice(0, 180);
  return /\.csv$/i.test(safe) ? safe : `${safe}.csv`;
}

export function filenameFromContentDisposition(header, fallback = DEFAULT_EXPORT_FILENAME) {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return sanitizeReportFilename('', fallback);

  const encodedMatch = String(value).match(/filename\*\s*=\s*(?:UTF-8''|utf-8'')?([^;]+)/i);
  const plainMatch = String(value).match(/filename\s*=\s*([^;]+)/i);
  const candidate = encodedMatch?.[1] ? decodeFilename(encodedMatch[1]) : decodeFilename(plainMatch?.[1]);
  return sanitizeReportFilename(candidate, fallback);
}

export const reportsApi = {
  getSummary: (params, signal) =>
    api.get('/reports/summary', { params, signal }).then(responseData),

  getTickets: (params, signal) =>
    api.get('/reports/tickets', { params, signal }).then(responseData),

  exportTickets: (params, signal) =>
    api.get('/reports/tickets/export', { params, responseType: 'blob', signal }).then((response) => ({
      blob: response.data,
      filename: filenameFromContentDisposition(
        response.headers?.['content-disposition'] ?? response.headers?.['Content-Disposition'],
      ),
    })),
};

// A descriptive alias keeps the endpoint intent clear to callers that think
// in terms of CSV rather than ticket rows.
reportsApi.exportCsv = reportsApi.exportTickets;
