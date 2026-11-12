// Dashboard: registration (ROP/RTA), insurance, route permit, inspection and driving licence dates
// that are overdue or fall within the organization's alert window. Rows come from v_fleet_expiries,
// so RLS limits them to the offices the user can see; the office switcher narrows further.
import React, { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useOptionalOrg } from '../../context/OrgContext';
import { fetchFleetExpiries, EXPIRY_LABEL, type FleetExpiry } from '../../services/drivers';
import { formatDate, getDaysDifference } from '../../utils/date';

export const FleetExpiryPanel: React.FC = () => {
  const { selectedCompanyId, companies } = useFleet();
  const { openVehicleDetail, setCurrentPage } = useUI();
  const days = useOptionalOrg()?.organization?.expiryAlertDays ?? 30;
  const [rows, setRows] = useState<FleetExpiry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    fetchFleetExpiries(until).then(r => { if (live) { setRows(r); setError(null); } }).catch(e => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [days]);

  const list = (rows ?? []).filter(r => selectedCompanyId === 'all' || r.companyId === selectedCompanyId);
  const overdue = list.filter(r => getDaysDifference(r.dueDate) < 0).length;
  const office = (id: string) => companies.find(c => c.id === id)?.code ?? '';

  return (
    <Card className="bg-white">
      <CardHeader className="py-4 px-5">
        <CardTitle className="text-sm font-bold text-slate-100 flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Expiries and inspections</CardTitle>
        <p className="text-xs text-slate-400">
          {rows === null && !error ? 'Loading…' : `${list.length} due within ${days} days${overdue ? `, ${overdue} overdue` : ''}`}
        </p>
      </CardHeader>
      <div className="px-5 pb-4">
        {error && <p role="alert" className="text-xs text-rose-500">{error}</p>}
        {rows !== null && list.length === 0 && <p className="text-xs text-slate-400 py-3">Nothing due. Registration, insurance, permits, inspections and licences are all in date.</p>}
        {list.length > 0 && (
          <ul className="divide-y divide-slate-700/60 max-h-80 overflow-auto">
            {list.slice(0, 50).map(r => {
              const d = getDaysDifference(r.dueDate);
              return (
                <li key={`${r.kind}:${r.driverId ?? r.vehicleId}`} className="py-2 flex items-center justify-between gap-3">
                  <button type="button" className="text-left min-w-0"
                    onClick={() => (r.kind === 'licence' ? setCurrentPage('drivers') : r.vehicleId && openVehicleDetail(r.vehicleId))}>
                    <p className="text-xs font-semibold text-slate-100 truncate">{r.label} <span className="text-slate-400 font-normal">· {office(r.companyId)}</span></p>
                    <p className="text-[11px] text-slate-400">{EXPIRY_LABEL[r.kind]} · {formatDate(r.dueDate)}</p>
                  </button>
                  <Badge variant={d < 0 ? 'rose' : d <= 7 ? 'amber' : 'slate'}>{d < 0 ? `${-d} day${d === -1 ? '' : 's'} overdue` : d === 0 ? 'Today' : `in ${d} day${d === 1 ? '' : 's'}`}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
};
