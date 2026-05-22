import React, { useEffect } from 'react';
import PDFViewer from './PDFViewer';
import { getLoadRateConfirmationUrl } from '../services/api';
import './RateConfirmationModal.css';

const RateConfirmationModal = ({ loadId, loadNumber, onClose }) => {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!loadId) return null;

  const pdfUrl = getLoadRateConfirmationUrl(loadId);
  const label = loadNumber != null && loadNumber !== '' ? String(loadNumber) : '';
  const docTitle = label ? `Rate confirmation — Load #${label}` : 'Rate confirmation';

  return (
    <div className="rate-confirmation-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="rate-confirmation-modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rate-confirmation-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rate-confirmation-modal-header">
          <h3 id="rate-confirmation-modal-title">{docTitle}</h3>
          <button type="button" className="rate-confirmation-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="rate-confirmation-modal-body">
          <PDFViewer pdfUrl={pdfUrl} invoiceNumber={label || loadId} documentTitle={docTitle} />
        </div>
      </div>
    </div>
  );
};

export default RateConfirmationModal;
