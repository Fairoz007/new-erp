// Step 7: expense categories (each posts to a GL expense account) and monthly recurring expenses.
// Also Settings → Expense categories.
import React, { useEffect, useState } from 'react';
import type { AccountTemplate, ExpenseCategory, RecurringExpense } from '../../../services/org';
import * as org from '../../../services/org';
import { MasterEditor } from '../MasterEditor';
import { Section, errText, useMaster, useOffices } from '../shared';

const METHODS = ['Bank Transfer', 'Cash', 'Cheque', 'Card'];

export const ExpenseCategoriesStep: React.FC<{ readOnly?: boolean }> = ({ readOnly }) => {
  const [accounts, setAccounts] = useState<AccountTemplate[]>([]);
  const [accErr, setAccErr] = useState<string | null>(null);
  const categories = useMaster('expenseCategories');
  const { offices } = useOffices();
  useEffect(() => {
    org.listAccountTemplates().then(a => setAccounts(a.filter(x => x.category === 'Expense'))).catch(e => setAccErr(errText(e)));
  }, []);
  const accountOptions = accounts.map(a => ({ value: a.code, label: `${a.code} ${a.name}` }));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <Section title="Expense categories" description="Each category posts to the expense account you choose. Defaults can be renamed or deactivated.">
        {accErr && <p className="text-xs text-rose-500">Could not load accounts: {accErr}</p>}
        <MasterEditor<ExpenseCategory>
          master="expenseCategories" readOnly={readOnly} rowKey={r => r.id} addLabel="Add category" onChanged={categories.reload}
          blank={{ name: '', glAccountCode: accounts[0]?.code ?? '', requiresVehicle: false, active: true }}
          canDelete={r => (r.isSystem ? 'Default categories cannot be deleted; untick Active instead' : null)}
          columns={[
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'glAccountCode', label: 'GL account', type: 'select', required: true, options: accountOptions },
            { key: 'requiresVehicle', label: 'Vehicle required', type: 'checkbox' },
            { key: 'active', label: 'Active', type: 'checkbox' },
          ]}
        />
      </Section>
      <Section title="Recurring monthly expenses" description="Rent, permits, subscriptions and similar. Templates are saved here; the monthly job that turns them into expenses for approval is part of the Expenses module.">
        {offices.length === 0 ? <p className="text-xs text-slate-400">Add an office first (step 3).</p> : (
          <MasterEditor<RecurringExpense>
            master="recurringExpenses" readOnly={readOnly} rowKey={r => r.id} addLabel="Add recurring expense"
            emptyText="No recurring expenses yet."
            blank={{ companyId: offices[0]?.id, categoryId: categories.rows.find(c => c.active)?.id ?? '', description: '', amount: 0, tax: 0,
              paymentMethod: 'Bank Transfer', dayOfMonth: 1, startDate: today, endDate: '', active: true }}
            columns={[
              { key: 'companyId', label: 'Office', type: 'select', required: true, options: offices.map(o => ({ value: o.id, label: o.code })) },
              { key: 'categoryId', label: 'Category', type: 'select', required: true, options: categories.rows.filter(c => c.active).map(c => ({ value: c.id, label: c.name })) },
              { key: 'description', label: 'Description', type: 'text', required: true },
              { key: 'amount', label: 'Amount', type: 'number', min: 0.001, step: '0.001', required: true, width: '100px' },
              { key: 'tax', label: 'Tax', type: 'number', min: 0, step: '0.001', width: '80px' },
              { key: 'paymentMethod', label: 'Paid by', type: 'select', options: METHODS.map(m => ({ value: m, label: m })) },
              { key: 'dayOfMonth', label: 'Day', type: 'number', min: 1, max: 28, required: true, width: '70px' },
              { key: 'startDate', label: 'From', type: 'text', required: true, placeholder: 'YYYY-MM-DD', validate: v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? null : 'YYYY-MM-DD') },
              { key: 'endDate', label: 'Until', type: 'text', placeholder: 'optional', validate: v => (v && !/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? 'YYYY-MM-DD' : null) },
              { key: 'active', label: 'Active', type: 'checkbox' },
            ]}
          />
        )}
      </Section>
    </div>
  );
};
