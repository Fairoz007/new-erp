import React from 'react';
import { Building2, Plus, Phone, Mail, Globe, MapPin, CreditCard, ShieldCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency } from '../../utils/financial';

export const CompaniesPage: React.FC = () => {
  const { companies, vehicles, invoices, selectedCompanyId, setSelectedCompanyId, currency } = useFleet();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-indigo-400" />
            <span>Multi-Company & Entity Management</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage subsidiary entities, tax numbers, commercial registration, corporate bank accounts, and financial years.
          </p>
        </div>
      </div>

      {/* Companies Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {companies.map(comp => {
          const compVehicles = vehicles.filter(v => v.companyId === comp.id);
          const compInvoices = invoices.filter(i => i.companyId === comp.id);
          const isSelected = selectedCompanyId === comp.id;

          return (
            <Card
              key={comp.id}
              className={`transition-all ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500/60 shadow-xl' : 'hover:border-slate-600'}`}
            >
              <CardHeader
                action={
                  <Button
                    variant={isSelected ? 'primary' : 'outline'}
                    size="xs"
                    onClick={() => setSelectedCompanyId(isSelected ? 'all' : comp.id)}
                  >
                    {isSelected ? 'Active Filter' : 'Filter by Entity'}
                  </Button>
                }
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-sm shrink-0">
                    {comp.code.slice(0, 3)}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-100 line-clamp-1">{comp.name}</h3>
                    <span className="text-[11px] text-slate-400 font-mono">{comp.code} • {comp.city}, {comp.country}</span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 text-xs">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 text-center">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Assigned Fleet</span>
                    <span className="text-base font-bold text-slate-100">{compVehicles.length} Vehicles</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Invoices Logged</span>
                    <span className="text-base font-bold text-slate-100">{compInvoices.length} Invoices</span>
                  </div>
                </div>

                {/* Tax & Registration Details */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">CR Number:</span>
                    <span className="font-mono font-semibold text-slate-200">{comp.registrationNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">VAT Number:</span>
                    <span className="font-mono font-semibold text-slate-200">{comp.vatNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tax File:</span>
                    <span className="font-mono text-slate-300">{comp.taxNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Financial Year:</span>
                    <span className="text-slate-300">{comp.financialYear}</span>
                  </div>
                </div>

                {/* Bank Account */}
                {comp.bankDetails && (
                  <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
                    <p className="font-semibold text-indigo-300 flex items-center gap-1.5 text-[11px]">
                      <CreditCard className="w-3.5 h-3.5" /> {comp.bankDetails.bankName}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">IBAN: {comp.bankDetails.iban}</p>
                    <p className="text-[10px] text-slate-400">Branch: {comp.bankDetails.branch}</p>
                  </div>
                )}

                {/* Contact info */}
                <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
                  <p className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">{comp.address}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>{comp.phone}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>{comp.email}</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
