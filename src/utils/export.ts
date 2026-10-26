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
export function printElement(_elementId?: string): void {
  window.print();
}

/** One cell as plain text for PDF / preview output. */
export function cellToText(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') return Number.isInteger(val) ? String(val) : val.toFixed(3);
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'object') return '';
  return String(val);
}

/**
 * Real PDF download (no print dialog): header, generated-at line, repeating table header and
 * page numbers. jsPDF is loaded on demand so it does not weigh down the first page load.
 */
export async function exportToPDF(
  filename: string,
  title: string,
  columns: string[],
  rows: string[][],
  opts: { subtitle?: string; rightAlign?: number[] } = {},
): Promise<void> {
  if (!rows.length) {
    alert('No data available to export.');
    return;
  }
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, 40, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Al Hakim National LLC  |  Generated ${new Date().toLocaleString()}${opts.subtitle ? `  |  ${opts.subtitle}` : ''}`, 40, 58);
  doc.setTextColor(0);

  const columnStyles: Record<number, { halign: 'right' }> = {};
  (opts.rightAlign ?? []).forEach(i => { columnStyles[i] = { halign: 'right' }; });

  autoTable(doc, {
    head: [columns],
    body: rows,
    startY: 70,
    margin: { left: 40, right: 40, bottom: 40 },
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [8, 99, 67], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 248, 246] },
    columnStyles,
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - 40, pageHeight - 20, { align: 'right' });
      doc.setTextColor(0);
    },
  });
  doc.save(`${filename}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
