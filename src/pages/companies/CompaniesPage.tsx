import React from 'react';
import { Building2, Phone, Mail, MapPin, CreditCard, ShieldCheck, Users, Car, FileText, CheckCircle2, Layers } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useFleet } from '../../context/FleetContext';

export const CompaniesPage: React.FC = () => {
  const { companies, vehicles, invoices, employees, selectedCompanyId, setSelectedCompanyId, resetToDefaultData } = useFleet();


  // Restrict strictly to Head Office (comp-1) and Duqm Office (comp-2)
  const activeOffices = companies.filter(c => c.id === 'comp-1' || c.id === 'comp-2');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Offices & Branches Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            Corporate organizational structure for <strong className="text-slate-100">Al Hakim National LLC</strong> — segregated operational management for Head Office (Muscat) and Duqm Office (SEZAD).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant={selectedCompanyId === 'all' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSelectedCompanyId('all')}
            className="cursor-pointer rounded-full"
          >
            <Layers className="w-4 h-4 mr-1.5" />
            {selectedCompanyId === 'all' ? 'Viewing Consolidated (All Offices)' : 'Switch to Consolidated View'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { if (window.confirm('Reset ALL data to the default dataset? Unsaved records will be lost.')) resetToDefaultData(); }}
            title="Re-synchronize Head Office and Duqm Office dataset"
            className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer rounded-full"
          >
            Sync Dual Offices
          </Button>
        </div>
      </div>

      {/* Enterprise Master Overview Banner */}
      <div className="bg-white border border-slate-700 rounded-[20px] p-5 sm:p-6 shadow-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-forest-500 flex items-center justify-center font-bold text-white text-xl shadow-md shrink-0">
              AHN
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100 tracking-tight">Al Hakim National LLC</h2>
                <span className="text-[10px] bg-forest-100 text-forest-700 font-semibold px-2.5 py-0.5 rounded-full border border-forest-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-forest-600" /> Active Enterprise
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Headquarters: Muscat, Sultanate of Oman • Commercial Fleet, Industrial Logistics & Technical Services
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="px-3 py-1.5 bg-slate-850/80 border border-slate-700 rounded-xl">
              <span className="text-slate-400 block text-[10px]">Commercial Reg (CR)</span>
              <span className="font-mono font-bold text-slate-200">CR-1384920</span>
            </div>
            <div className="px-3 py-1.5 bg-slate-850/80 border border-slate-700 rounded-xl">
              <span className="text-slate-400 block text-[10px]">Corporate VAT Identification</span>
              <span className="font-mono font-bold text-slate-200">OM1100482910</span>
            </div>
            <div className="px-3 py-1.5 bg-slate-850/80 border border-slate-700 rounded-xl">
              <span className="text-slate-400 block text-[10px]">Tax Card Number</span>
              <span className="font-mono font-bold text-slate-200">TAX-8849102</span>
            </div>
          </div>
        </div>
      </div>

      {/* Offices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {activeOffices.map(comp => {
          const compVehicles = vehicles.filter(v => v.companyId === comp.id);
          const compInvoices = invoices.filter(i => i.companyId === comp.id);
          const compStaff = employees.filter(e => e.companyId === comp.id);
          const isSelected = selectedCompanyId === comp.id;
          const isHeadOffice = comp.id === 'comp-1';

          return (
            <Card
              key={comp.id}
              className={`rounded-[20px] bg-white border transition-all ${
                isSelected
                  ? 'ring-2 ring-forest-500 border-forest-500 shadow-card'
                  : 'border-slate-700 hover:border-slate-600 shadow-card'
              }`}
            >
              <CardHeader
                action={
                  <Button
                    variant={isSelected ? 'primary' : 'outline'}
                    size="xs"
                    onClick={() => setSelectedCompanyId(isSelected ? 'all' : comp.id)}
                    className="cursor-pointer rounded-full"
                  >
                    {isSelected ? 'Active Filter (Click to Reset)' : `Filter by ${isHeadOffice ? 'Head Office' : 'Duqm Office'}`}
                  </Button>
                }
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-forest-100 text-forest-700 border border-forest-500/20 flex items-center justify-center font-bold text-base shrink-0">
                    {isHeadOffice ? 'HO' : 'DQM'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base text-slate-100">{comp.name}</h3>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-slate-850 text-forest-700 font-semibold border border-slate-700">
                        {isHeadOffice ? 'Corporate HQ' : 'SEZAD Branch'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Code: {comp.code} • {comp.city}, {comp.state}, {comp.country}
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 text-xs">
                {/* Office Role Description */}
                <p className="text-xs text-slate-300 bg-slate-850/60 p-3 rounded-xl border border-slate-700/80 leading-relaxed">
                  {comp.notes}
                </p>

                {/* Operational Stats Grid */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-850/60 rounded-xl border border-slate-700/80 text-center">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-medium flex items-center justify-center gap-1">
                      <Car className="w-3 h-3 text-forest-500" /> Assigned Fleet
                    </span>
                    <span className="text-lg font-bold text-slate-100 mt-0.5 block">{compVehicles.length} Vehicles</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-medium flex items-center justify-center gap-1">
                      <Users className="w-3 h-3 text-forest-500" /> Office Staff
                    </span>
                    <span className="text-lg font-bold text-slate-100 mt-0.5 block">{compStaff.length} Employees</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-medium flex items-center justify-center gap-1">
                      <FileText className="w-3 h-3 text-forest-500" /> Invoices Logged
                    </span>
                    <span className="text-lg font-bold text-slate-100 mt-0.5 block">{compInvoices.length} Invoices</span>
                  </div>
                </div>

                {/* Tax & Registration Details */}
                <div className="space-y-2 pt-1 bg-slate-850/40 p-3 rounded-xl border border-slate-700/60">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Commercial Registration (CR):</span>
                    <span className="font-mono font-semibold text-slate-200">{comp.registrationNumber}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">VAT Identification:</span>
                    <span className="font-mono font-semibold text-slate-200">{comp.vatNumber}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Financial Fiscal Period:</span>
                    <span className="text-slate-300 font-medium">{comp.financialYear}</span>
                  </div>
                </div>

                {/* Bank Account */}
                {comp.bankDetails && (
                  <div className="p-3 bg-slate-850/60 rounded-xl border border-slate-700/80 space-y-1">
                    <p className="font-semibold text-forest-700 flex items-center gap-1.5 text-[11px]">
                      <CreditCard className="w-3.5 h-3.5 text-forest-500" /> {comp.bankDetails.bankName}
                    </p>
                    <p className="text-[10px] text-slate-300 font-mono">IBAN: {comp.bankDetails.iban}</p>
                    <p className="text-[10px] text-slate-400">Operating Branch: {comp.bankDetails.branch}</p>
                  </div>
                )}

                {/* Contact info */}
                <div className="pt-2 border-t border-slate-700/80 text-[11px] text-slate-400 space-y-1.5">
                  <p className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{comp.address}, {comp.city}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{comp.phone}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
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
