// What a list's PDF export should say about where its rows come from. Reports → a report provides
// the office and dates chosen on that page; elsewhere nothing is provided and the export uses the
// office chosen in the header and "As of today".
import { createContext, useContext } from 'react';
import type { DocumentOffice } from '../../lib/branding';
import type { ReportPeriod } from '../../lib/a4/tableReport';

export interface ReportExportInfo {
  office?: DocumentOffice | null;
  period?: ReportPeriod;
  filters?: [string, string][];
}

export const ReportExportContext = createContext<ReportExportInfo | null>(null);
export const useReportExportInfo = () => useContext(ReportExportContext);
