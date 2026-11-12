// Shared building blocks for report tables. Rows are flat so the DataTable CSV / PDF export holds
// the raw values; render() only formats them.
import React from 'react';
import { Card } from '../../components/ui/Card';
import { DataTable, Column } from '../../components/ui/DataTable';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export type Row = Record<string, any>;

export const text = (key: string, header: string, extra: Partial<Column<Row>> = {}): Column<Row> => ({
  key, header, render: r => <span>{r[key] ?? ''}</span>, ...extra,
});
export const mono = (key: string, header: string): Column<Row> => ({
  key, header, render: r => <span className="font-mono">{r[key] ?? ''}</span>,
});
export const date = (key: string, header: string): Column<Row> => ({
  key, header, render: r => <span>{r[key] ? formatDate(r[key]) : ''}</span>,
});
export const money = (key: string, header: string, currency: string, bold = false): Column<Row> => ({
  key, header, align: 'right',
  render: r => <span className={bold ? 'font-bold' : ''}>{r[key] == null ? 'n/a' : formatCurrency(r[key], currency)}</span>,
});
export const int = (key: string, header: string, suffix = ''): Column<Row> => ({
  key, header, align: 'right', render: r => <span>{r[key] == null ? 'n/a' : `${Number(r[key]).toLocaleString()}${suffix}`}</span>,
});

export const EmptyReport: React.FC<{ message?: string }> = ({ message }) => (
  <Card className="p-6 rounded-[20px] bg-white border border-slate-700 shadow-card">
    <p className="text-sm font-semibold text-slate-200">No data for this report</p>
    <p className="text-xs text-slate-400 mt-1">{message ?? 'There are no records to report on for the selected office.'}</p>
  </Card>
);

export const ReportTable: React.FC<{ rows: Row[]; columns: Column<Row>[]; filename: string; keyField?: string; title?: string }> = ({ rows, columns, filename, keyField = 'id', title }) =>
  rows.length === 0
    ? <EmptyReport />
    : <DataTable data={rows} columns={columns} keyExtractor={r => String(r[keyField])} exportFilename={filename} title={title} />;

