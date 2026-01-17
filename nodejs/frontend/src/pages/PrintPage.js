import React, { useState, useEffect } from 'react';
import { getInvoices, downloadInvoicePDF, getInvoice, deleteInvoice } from '../services/api';
import { formatDate } from '../utils/dateUtils';
import PDFViewer from '../components/PDFViewer';
import './PrintPage.css';

// Calculate ending Monday from invoice loads
// The ending Monday is invoice_monday + 7 days (the Monday that ends the invoice week)
// All loads in an invoice should have the same invoice_monday since they're grouped by week
const calculateEndingMonday = (invoice) => {
  if (!invoice.load_ids || invoice.load_ids.length === 0) {
    return null;
  }
  
  // Try to get invoice_monday from any load (all loads in an invoice should have the same invoice_monday)
  let invoiceMonday = null;
  for (const load of invoice.load_ids) {
    if (load.invoice_monday) {
      invoiceMonday = new Date(load.invoice_monday);
      break; // All loads should have the same invoice_monday
    }
  }
  
  if (invoiceMonday) {
    // Ending Monday is invoice_monday + 7 days
    const endingMonday = new Date(invoiceMonday);
    endingMonday.setUTCDate(invoiceMonday.getUTCDate() + 7);
    endingMonday.setUTCHours(0, 0, 0, 0);
    return endingMonday;
  }
  
  // Fallback: calculate from latest delivery date if invoice_monday is not available
  let latestDelivery = null;
  for (const load of invoice.load_ids) {
    if (load.delivery_date) {
      const deliveryDate = new Date(load.delivery_date);
      deliveryDate.setUTCHours(0, 0, 0, 0);
      if (!latestDelivery || deliveryDate > latestDelivery) {
        latestDelivery = deliveryDate;
      }
    }
  }
  
  if (!latestDelivery) {
    return null;
  }
  
  // Find the Monday of the week containing the latest delivery date
  const dayOfWeek = latestDelivery.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const mondayOfWeek = new Date(latestDelivery);
  mondayOfWeek.setUTCDate(latestDelivery.getUTCDate() - daysSinceMonday);
  mondayOfWeek.setUTCHours(0, 0, 0, 0);
  
  // Ending Monday is the Monday after the week (Monday + 7 days)
  const endingMonday = new Date(mondayOfWeek);
  endingMonday.setUTCDate(mondayOfWeek.getUTCDate() + 7);
  
  return endingMonday;
};

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

  // Helper function to get carrier name from invoice (the billTo name)
  const getCarrierName = (invoice) => {
    // Use the billTo name, which is the carrier the invoice is billed to
    if (invoice.billTo && invoice.billTo.name) {
      return invoice.billTo.name;
    }
    // Fallback: try to get from first load's carrier if billTo is not set
    if (invoice.load_ids && invoice.load_ids.length > 0) {
      const firstLoad = invoice.load_ids[0];
      if (firstLoad && firstLoad.carrier_id) {
        return typeof firstLoad.carrier_id === 'object' 
          ? firstLoad.carrier_id.name 
          : 'Unknown Carrier';
      }
    }
    return 'Unknown Carrier';
  };

  // Helper function to get invoice date (ending Monday)
  const getInvoiceDate = (invoice) => {
    // Calculate ending Monday from loads
    const endingMonday = calculateEndingMonday(invoice);
    if (endingMonday) {
      return endingMonday;
    }
    // Fallback to invoiceDate or generated_at
    return invoice.invoiceDate || invoice.generated_at;
  };

  // Helper function to format invoice label
  const getInvoiceLabel = (invoice) => {
    const carrierName = getCarrierName(invoice);
    const date = getInvoiceDate(invoice);
    return `${carrierName} invoice ${formatDate(date)}`;
  };
  
  // Group invoices by company
  const groupInvoicesByCompany = (invoices) => {
    const grouped = {};
    
    invoices.forEach(invoice => {
      const companyName = getCarrierName(invoice);
      if (!grouped[companyName]) {
        grouped[companyName] = [];
      }
      grouped[companyName].push(invoice);
    });
    
    // Sort each group by ending Monday date (most recent first)
    Object.keys(grouped).forEach(company => {
      grouped[company].sort((a, b) => {
        const dateA = getInvoiceDate(a);
        const dateB = getInvoiceDate(b);
        return new Date(dateB) - new Date(dateA);
      });
    });
    
    // Sort companies alphabetically
    const sortedCompanies = Object.keys(grouped).sort();
    
    return sortedCompanies.map(company => ({
      company,
      invoices: grouped[company]
    }));
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
          {groupInvoicesByCompany(invoices).map(({ company, invoices: companyInvoices }) => (
            <div key={company} className="invoice-company-group">
              <h3 className="company-header">{company}</h3>
              <div className="company-invoices">
                {companyInvoices.map((invoice) => (
                  <div key={invoice._id} className="invoice-card">
                    <div className="invoice-header">
                      <h4>{getInvoiceLabel(invoice)}</h4>
                      <span className="invoice-date">
                        Ending: {formatDate(getInvoiceDate(invoice))}
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
            </div>
          ))}
        </div>
      )}

      {viewingInvoice && pdfUrl && (
        <div className="pdf-viewer-modal">
          <div className="pdf-viewer-header">
            <h3>{getInvoiceLabel(viewingInvoice)}</h3>
            <button onClick={handleCloseViewer} className="close-btn">×</button>
          </div>
          <PDFViewer pdfUrl={pdfUrl} invoiceNumber={viewingInvoice.invoice_number} />
        </div>
      )}
    </div>
  );
};

export default PrintPage;

