import { beforeEach, describe, expect, it, vi } from 'vitest';
import { filenameFromContentDisposition, reportsApi, sanitizeReportFilename } from './reports.api';

const getMock = vi.hoisted(() => vi.fn());
vi.mock('./axios', () => ({ default: { get: getMock } }));

beforeEach(() => {
  getMock.mockReset();
});

describe('reportsApi', () => {
  it('uses the frozen summary and tickets endpoints with params and AbortSignal', async () => {
    const signal = new AbortController().signal;
    getMock.mockResolvedValueOnce({ data: { success: true, data: { role: 'AGENT' } } });
    getMock.mockResolvedValueOnce({ data: { success: true, data: { rows: [] } } });

    await expect(reportsApi.getSummary({ from: '2026-08-01' }, signal)).resolves.toEqual({ role: 'AGENT' });
    await expect(reportsApi.getTickets({ page: 1 }, signal)).resolves.toEqual({ rows: [] });
    expect(getMock).toHaveBeenNthCalledWith(1, '/reports/summary', { params: { from: '2026-08-01' }, signal });
    expect(getMock).toHaveBeenNthCalledWith(2, '/reports/tickets', { params: { page: 1 }, signal });
  });

  it('requests a blob and safely exposes the Content-Disposition filename', async () => {
    const blob = new Blob(['a,b\n1,2'], { type: 'text/csv' });
    getMock.mockResolvedValue({
      data: blob,
      headers: { 'content-disposition': "attachment; filename*=UTF-8''service%20desk%2Freport.csv" },
    });
    const signal = new AbortController().signal;

    await expect(reportsApi.exportTickets({ from: '2026-08-01' }, signal)).resolves.toEqual({
      blob,
      filename: 'service desk-report.csv',
    });
    expect(getMock).toHaveBeenCalledWith('/reports/tickets/export', {
      params: { from: '2026-08-01' },
      responseType: 'blob',
      signal,
    });
  });

  it('falls back to a CSV filename and removes path/control characters', () => {
    expect(filenameFromContentDisposition('attachment; filename="../../report\r\n.csv"')).toBe('..-..-report-.csv');
    expect(sanitizeReportFilename('report.exe')).toBe('report.exe.csv');
    expect(filenameFromContentDisposition('')).toBe('authorized-report.csv');
  });
});

