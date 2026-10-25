/**
 * Neutralise spreadsheet formula injection: a text cell that starts with = + - @ (or tab / CR)
 * is prefixed with an apostrophe so Excel/Sheets treat it as text. Real numbers and plain numeric
 * strings (e.g. "-12.500") are left untouched.
 */
export function csvSafeCell(val: unknown): string {
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (typeof val === 'number') return str;
  if (/^[-+]?\d+(\.\d+)?$/.test(str)) return str;
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}

/**
 * CSV Exporter utility
 */
export function exportToCSV<T extends Record<string, any>>(
  filename: string,
  data: T[],
  headers?: { key: keyof T; label: string }[]
): void {
  if (!data || !data.length) {
    alert('No data available to export.');
    return;
  }

  let csvContent = '';

  if (headers && headers.length) {
    const headerRow = headers.map(h => `"${csvSafeCell(h.label).replace(/"/g, '""')}"`).join(',');
    csvContent += headerRow + '\r\n';

    data.forEach(item => {
      const row = headers
        .map(h => {
          const val = item[h.key];
          if (val === null || val === undefined) return '""';
          const stringVal = csvSafeCell(val);
          return `"${stringVal.replace(/"/g, '""')}"`;
        })
        .join(',');
      csvContent += row + '\r\n';
    });
  } else {
    const keys = Object.keys(data[0]);
    const headerRow = keys.map(k => `"${csvSafeCell(k).replace(/"/g, '""')}"`).join(',');
    csvContent += headerRow + '\r\n';

    data.forEach(item => {
      const row = keys
        .map(k => {
          const val = item[k];
          if (val === null || val === undefined) return '""';
          const stringVal = csvSafeCell(val);
          return `"${stringVal.replace(/"/g, '""')}"`;
        })
        .join(',');
      csvContent += row + '\r\n';
    });
  }

  // UTF-8 BOM so Excel renders non-ASCII names (e.g. Arabic) correctly
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * JSON Exporter
 */
export function exportToJSON(filename: string, data: any): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Print window / trigger browser print for invoices & reports
 */
export function printElement(elementId?: string): void {
  window.print();
}
