// Change which offices can see and use a client/supplier (set_party_sharing; edit rights in its home office).
import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { setPartySharing } from '../../services/finance';
import { PartyOfficeFields, PartyOfficeValue, validatePartyOffice } from './PartyOfficeFields';

interface Props {
  type: 'Customer' | 'Supplier';
  party: { id: string; name: string; officeId: string; sharing: PartyOfficeValue['sharing']; sharedOfficeIds: string[] } | null;
  onClose: () => void;
}

export const PartySharingModal: React.FC<Props> = ({ type, party, onClose }) => {
  const { reload } = useFleet();
  const { addToast } = useUI();
  const [value, setValue] = useState<PartyOfficeValue>({ officeId: '', sharing: 'office', sharedOfficeIds: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (party) setValue({ officeId: party.officeId, sharing: party.sharing, sharedOfficeIds: [...party.sharedOfficeIds] });
    setError(null);
  }, [party]);
  if (!party) return null;

  const save = async () => {
    const err = validatePartyOffice(value);
    if (err) { setError(err); return; }
    setBusy(true); setError(null);
    try {
      await setPartySharing(type, party.id, value.sharing, value.sharing === 'selected' ? value.sharedOfficeIds : []);
      await reload([type === 'Customer' ? 'customers' : 'suppliers']);
      addToast({ type: 'success', title: 'Sharing updated', message: party.name });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="md" title={`Offices that can use ${party.name}`}
      description="The home office owns the record. To change it, use Transfer to office.">
      <div className="space-y-4">
        <PartyOfficeFields module={type === 'Customer' ? 'customers' : 'suppliers'} value={value} onChange={setValue} lockOffice />
        {error && <p role="alert" className="text-xs text-rose-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} isLoading={busy}>Save</Button>
        </div>
      </div>
    </Modal>
  );
};
