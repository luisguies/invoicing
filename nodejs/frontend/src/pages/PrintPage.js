import React, { useState, useEffect } from 'react';
import { getInvoices, downloadInvoicePDF, getInvoice, deleteInvoice } from '../services/api';
import { formatDate } from '../utils/dateUtils';
import PDFViewer from '../components/PDFViewer';
import './PrintPage.css';

const PrintPage = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const data = await getInvoices();
      setInvoices(data);
    } catch (error) {
      alert('Failed to load invoices: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (invoiceId) => {
    setDownloading(invoiceId);
    try {
      await downloadInvoicePDF(invoiceId);
    } catch (error) {
      alert('Failed to download invoice: ' + (error.response?.data?.error || error.message));
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = async (invoiceId) => {
    if (!window.confirm('Delete this invoice? This will also delete the stored PDF file.')) {
      return;
    }

    setDeleting(invoiceId);
    try {
      await deleteInvoice(invoiceId);

      // If we're viewing this invoice, close the viewer.
      if (viewingInvoice?._id === invoiceId) {
        handleCloseViewer();
      }

      // Refresh list
      await loadInvoices();
    } catch (error) {
      alert('Failed to delete invoice: ' + (error.response?.data?.error || error.message));
    } finally {
      setDeleting(null);
    }
  };

  const handleView = async (invoiceId) => {
    try {
      const invoice = await getInvoice(invoiceId);
      // Create blob URL for PDF viewing
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/invoices/${invoiceId}/pdf`);
      if (!response.ok) throw new Error('Failed to fetch PDF');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      setPdfUrl(url);
      setViewingInvoice(invoice);
    } catch (error) {
      alert('Failed to load invoice: ' + (error.message || 'Unknown error'));
    }
  };

  const handleCloseViewer = () => {
    if (pdfUrl) {
      window.URL.revokeObjectURL(pdfUrl);
    }
    setViewingInvoice(null);
    setPdfUrl(null);
  };

  if (loading) {
    return <div className="loading">Loading invoices...</div>;
  }

  return (
    <div className="print-page">
      <div className="page-header">
        <h2>Generated Invoices</h2>
        <button onClick={loadInvoices} className="refresh-btn">Refresh</button>
      </div>

      {invoices.length === 0 ? (
        <div className="no-invoices">
          <p>No invoices have been generated yet.</p>
          <p>Go to the Loads page to generate invoices.</p>
        </div>
      ) : (
        <div className="invoices-list">
          {invoices.map((invoice) => (
            <div key={invoice._id} className="invoice-card">
              <div className="invoice-header">
                <h3>Invoice #{invoice.invoice_number}</h3>
                <span className="invoice-date">
                  Generated: {formatDate(invoice.generated_at)}
                </span>
              </div>
              <div className="invoice-details">
                <p>
                  <strong>Loads:</strong> {invoice.load_ids?.length || 0}
                </p>
                <p>
                  <strong>Total Amount:</strong> $
                  {(typeof invoice.total === 'number'
                    ? invoice.total
                    : (invoice.subtotal || 0)
                  ).toFixed(2)}
                </p>
              </div>
              <div className="invoice-actions">
                <button
                  className="view-btn"
                  onClick={() => handleView(invoice._id)}
                >
                  View PDF
                </button>
                <button
                  className="download-btn"
                  onClick={() => handleDownload(invoice._id)}
                  disabled={downloading === invoice._id}
                >
                  {downloading === invoice._id ? 'Downloading...' : 'Download PDF'}
                </button>
                <button
                  className="delete-btn"
                  onClick={() => handleDelete(invoice._id)}
                  disabled={deleting === invoice._id}
                >
                  {deleting === invoice._id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewingInvoice && pdfUrl && (
        <div className="pdf-viewer-modal">
          <div className="pdf-viewer-header">
            <h3>Invoice #{viewingInvoice.invoice_number}</h3>
            <button onClick={handleCloseViewer} className="close-btn">×</button>
          </div>
          <PDFViewer pdfUrl={pdfUrl} invoiceNumber={viewingInvoice.invoice_number} />
        </div>
      )}
    </div>
  );
};

export default PrintPage;

