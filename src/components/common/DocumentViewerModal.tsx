import React from 'react';
import { Modal } from '../ui/Modal';
import { useUI } from '../../context/UIContext';
import { ImageViewer } from './ImageViewer';

// viewingBill.url may be:
//   storage://<bucket>/<path>  -> resolved to a short-lived signed URL (preferred; see toStorageRef)
//   blob:... / https:... / data: -> shown as is (a file picked but not yet uploaded)
export const DocumentViewerModal: React.FC = () => {
  const { viewingBill, closeBillModal } = useUI();
  if (!viewingBill) return null;
  return (
    <Modal isOpen={!!viewingBill} onClose={closeBillModal} title="Document viewer" description={viewingBill.title} size="xl" guardUnsaved={false}>
      <ImageViewer source={viewingBill.url} title={viewingBill.title} type={viewingBill.type} size={viewingBill.size} />
    </Modal>
  );
};
