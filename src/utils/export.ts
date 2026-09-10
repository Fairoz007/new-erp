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
    const headerRow = headers.map(h => `"${h.label}"`).join(',');
    csvContent += headerRow + '\r\n';

    data.forEach(item => {
      const row = headers
        .map(h => {
          const val = item[h.key];
          if (val === null || val === undefined) return '""';
          const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
          return `"${stringVal.replace(/"/g, '""')}"`;
        })
        .join(',');
      csvContent += row + '\r\n';
    });
  } else {
    const keys = Object.keys(data[0]);
    const headerRow = keys.map(k => `"${k}"`).join(',');
    csvContent += headerRow + '\r\n';

    data.forEach(item => {
      const row = keys
        .map(k => {
          const val = item[k];
          if (val === null || val === undefined) return '""';
          const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
          return `"${stringVal.replace(/"/g, '""')}"`;
        })
        .join(',');
      csvContent += row + '\r\n';
    });
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
}

/**
 * Print window / trigger browser print for invoices & reports
 */
export function printElement(elementId?: string): void {
  window.print();
}
