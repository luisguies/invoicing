import React, { useState, useEffect } from 'react';
import { getInvoices, downloadInvoicePDF, getInvoice, deleteInvoice, getInvoicePDFUrl, markInvoiceAsPaid } from '../services/api';
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

const INVOICES_PER_CARRIER = 10;
const getTodayDateInput = () => new Date().toISOString().slice(0, 10);
const toMoney = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

const PrintPage = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [togglingPaid, setTogglingPaid] = useState(null);
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [carrierSearch, setCarrierSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedCarriers, setExpandedCarriers] = useState(new Set());
  const [paidModalInvoice, setPaidModalInvoice] = useState(null);
  const [paidDate, setPaidDate] = useState(getTodayDateInput());
  const [paymentType, setPaymentType] = useState('full');
  const [partialAmount, setPartialAmount] = useState('');

  const loadInvoices = async (filters = {}) => {
    setLoading(true);
    try {
      const data = await getInvoices(filters);
      setInvoices(data);
    } catch (error) {
      alert('Failed to load invoices: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const handleSearch = () => {
    const filters = {};
    if (carrierSearch.trim()) filters.carrier = carrierSearch.trim();
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    loadInvoices(filters);
  };

  const toggleCarrierExpand = (company) => {
    setExpandedCarriers((prev) => {
      const next = new Set(prev);
      if (next.has(company)) next.delete(company);
      else next.add(company);
      return next;
    });
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

      // Refresh list (keep current search filters)
      const filters = {};
      if (carrierSearch.trim()) filters.carrier = carrierSearch.trim();
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;
      await loadInvoices(filters);
    } catch (error) {
      alert('Failed to delete invoice: ' + (error.response?.data?.error || error.message));
    } finally {
      setDeleting(null);
    }
  };

  const getInvoiceTotal = (invoice) => toMoney(
    typeof invoice?.total === 'number'
      ? invoice.total
      : (invoice?.subtotal || 0)
  );

  const getPaidAmount = (invoice) => {
    if (!invoice) return 0;
    if (invoice.paid) return getInvoiceTotal(invoice);
    return toMoney(invoice.paid_amount || 0);
  };

  const getRemainingAmount = (invoice) => {
    const total = getInvoiceTotal(invoice);
    const paidAmount = getPaidAmount(invoice);
    return toMoney(Math.max(total - paidAmount, 0));
  };

  const isInvoiceOverdue = (invoice) => {
    if (!invoice || invoice.paid) return false;
    const invoiceDate = getInvoiceDate(invoice);
    const parsedInvoiceDate = invoiceDate ? new Date(invoiceDate) : null;
    if (!parsedInvoiceDate || Number.isNaN(parsedInvoiceDate.getTime())) return false;

    const threshold = new Date();
    threshold.setMonth(threshold.getMonth() - 3);
    threshold.setHours(0, 0, 0, 0);

    return parsedInvoiceDate < threshold;
  };

  const hasPartialPayment = (invoice) => {
    if (!invoice || invoice.paid) return false;
    return Boolean(invoice.is_partial_payment) || getPaidAmount(invoice) > 0;
  };

  const closePaidModal = (force = false) => {
    if (!force && paidModalInvoice && togglingPaid === paidModalInvoice._id) return;
    setPaidModalInvoice(null);
    setPaidDate(getTodayDateInput());
    setPaymentType('full');
    setPartialAmount('');
  };

  const handleTogglePaid = async (invoice) => {
    if (invoice.paid) {
      setTogglingPaid(invoice._id);
      try {
        const updatedInvoice = await markInvoiceAsPaid(invoice._id, false, null);
        setInvoices((prev) => prev.map((item) => (
          item._id === invoice._id ? updatedInvoice : item
        )));
      } catch (error) {
        alert('Failed to update paid status: ' + (error.response?.data?.error || error.message));
      } finally {
        setTogglingPaid(null);
      }
      return;
    }

    setPaidModalInvoice(invoice || null);
    setPaidDate(invoice?.paid_date ? new Date(invoice.paid_date).toISOString().slice(0, 10) : getTodayDateInput());
    setPaymentType(hasPartialPayment(invoice) ? 'partial' : 'full');
    setPartialAmount('');
  };

  const handleConfirmPaidDate = async () => {
    if (!paidModalInvoice) return;
    if (!paidDate) {
      alert('Please select a paid date.');
      return;
    }

    const invoiceId = paidModalInvoice._id;
    const options = { paymentType };
    if (paymentType === 'partial') {
      const parsedPartialAmount = Number(partialAmount);
      if (!Number.isFinite(parsedPartialAmount) || parsedPartialAmount <= 0) {
        alert('Enter a valid partial payment amount greater than 0.');
        return;
      }
      options.paymentAmount = toMoney(parsedPartialAmount);
    }

    setTogglingPaid(invoiceId);
    try {
      const updatedInvoice = await markInvoiceAsPaid(invoiceId, true, paidDate, options);
      setInvoices((prev) => prev.map((invoice) => (
        invoice._id === invoiceId ? updatedInvoice : invoice
      )));
      closePaidModal(true);
    } catch (error) {
      alert('Failed to update paid status: ' + (error.response?.data?.error || error.message));
    } finally {
      setTogglingPaid(null);
    }
  };

  const handleView = async (invoiceId) => {
    try {
      const invoice = await getInvoice(invoiceId);
      const response = await fetch(getInvoicePDFUrl(invoiceId), { credentials: 'include' });
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

  // Helper function to get carrier name from invoice (carrier_name for old uploads, else billTo/loads)
  const getCarrierName = (invoice) => {
    if (invoice.carrier_name) return invoice.carrier_name;
    if (invoice.billTo && invoice.billTo.name) return invoice.billTo.name;
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
        <h2>Invoices</h2>
        <button
          onClick={() => {
            const filters = {};
            if (carrierSearch.trim()) filters.carrier = carrierSearch.trim();
            if (dateFrom) filters.dateFrom = dateFrom;
            if (dateTo) filters.dateTo = dateTo;
            loadInvoices(filters);
          }}
          className="refresh-btn"
        >
          Refresh
        </button>
      </div>

      <div className="invoice-search-bar">
        <input
          type="text"
          placeholder="Search by carrier..."
          value={carrierSearch}
          onChange={(e) => setCarrierSearch(e.target.value)}
          className="search-input carrier-input"
        />
        <input
          type="date"
          placeholder="From date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="search-input date-input"
        />
        <input
          type="date"
          placeholder="To date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="search-input date-input"
        />
        <button onClick={handleSearch} className="search-btn">Search</button>
      </div>

      {invoices.length === 0 ? (
        <div className="no-invoices">
          <p>No invoices found.</p>
          <p>Generate invoices from Loads, or upload old invoices from Upload Old Invoices.</p>
        </div>
      ) : (
        <div className="invoices-list">
          {groupInvoicesByCompany(invoices).map(({ company, invoices: companyInvoices }) => {
            const isExpanded = expandedCarriers.has(company);
            const visible = isExpanded ? companyInvoices : companyInvoices.slice(0, INVOICES_PER_CARRIER);
            const hasMore = companyInvoices.length > INVOICES_PER_CARRIER;
            const companyCurrentOwed = companyInvoices.reduce(
              (sum, inv) => sum + getRemainingAmount(inv),
              0
            );
            return (
              <div key={company} className="invoice-company-group">
                <div className="company-header-row">
                  <h3 className="company-header">{company}</h3>
                  <span className="company-current-owed">
                    Current Owed: ${companyCurrentOwed.toFixed(2)}
                  </span>
                </div>
                <div className="invoice-table-wrap">
                  <table className="invoice-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Invoice #</th>
                        <th>Loads</th>
                        <th>Total</th>
                        <th>Paid</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((invoice) => (
                        <tr key={invoice._id}>
                          <td data-label="Date">{formatDate(getInvoiceDate(invoice))}</td>
                          <td data-label="Invoice #">{invoice.invoice_number}</td>
                          <td data-label="Loads">{invoice.load_ids?.length ?? 0}</td>
                          <td data-label="Total">
                            $
                            {(typeof invoice.total === 'number'
                              ? invoice.total
                              : (invoice.subtotal || 0)
                            ).toFixed(2)}
                          </td>
                          <td data-label="Paid">
                            {invoice.paid ? (
                              <span className="badge paid">
                                Paid{invoice.paid_date ? ` (${formatDate(invoice.paid_date)})` : ''}
                              </span>
                            ) : isInvoiceOverdue(invoice) ? (
                              <span className="badge overdue">Unpaid - Overdue</span>
                            ) : hasPartialPayment(invoice) ? (
                              <span className="badge partial">
                                Partial - Remaining ${getRemainingAmount(invoice).toFixed(2)}
                              </span>
                            ) : (
                              <span className="badge unpaid">Unpaid</span>
                            )}
                          </td>
                          <td className="invoice-actions-cell" data-label="Actions">
                            <button
                              className={`table-btn ${invoice.paid ? 'unpaid-btn' : 'paid-btn'}`}
                              onClick={() => handleTogglePaid(invoice)}
                              disabled={togglingPaid === invoice._id}
                            >
                              {togglingPaid === invoice._id
                                ? '...'
                                : invoice.paid
                                  ? 'Mark Unpaid'
                                  : hasPartialPayment(invoice)
                                    ? 'Update Payment'
                                    : 'Mark Paid'}
                            </button>
                            <button
                              className="view-btn table-btn"
                              onClick={() => handleView(invoice._id)}
                            >
                              View
                            </button>
                            <button
                              className="download-btn table-btn"
                              onClick={() => handleDownload(invoice._id)}
                              disabled={downloading === invoice._id}
                            >
                              {downloading === invoice._id ? '…' : 'Download'}
                            </button>
                            <button
                              className="delete-btn table-btn"
                              onClick={() => handleDelete(invoice._id)}
                              disabled={deleting === invoice._id}
                            >
                              {deleting === invoice._id ? '…' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {hasMore && (
                    <button
                      type="button"
                      className="show-more-btn"
                      onClick={() => toggleCarrierExpand(company)}
                    >
                      {isExpanded
                        ? `Show less`
                        : `Show more (${companyInvoices.length - INVOICES_PER_CARRIER} more)`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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

      {paidModalInvoice && (
        <div className="paid-modal-overlay">
          <div className="paid-modal">
            <h3>Mark Invoice as Paid</h3>
            <p>
              <strong>{paidModalInvoice.invoice_number}</strong>
            </p>
            <div className="paid-modal-amounts">
              <p>Total: <strong>${getInvoiceTotal(paidModalInvoice).toFixed(2)}</strong></p>
              <p>Already paid: <strong>${getPaidAmount(paidModalInvoice).toFixed(2)}</strong></p>
              <p>Remaining: <strong>${getRemainingAmount(paidModalInvoice).toFixed(2)}</strong></p>
            </div>
            <label htmlFor="paidDateInput">Paid date</label>
            <input
              id="paidDateInput"
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
            />
            <div className="paid-type-options">
              <label>
                <input
                  type="radio"
                  name="paymentType"
                  value="full"
                  checked={paymentType === 'full'}
                  onChange={() => setPaymentType('full')}
                />
                Mark as fully paid
              </label>
              <label>
                <input
                  type="radio"
                  name="paymentType"
                  value="partial"
                  checked={paymentType === 'partial'}
                  onChange={() => setPaymentType('partial')}
                />
                Record partial payment
              </label>
            </div>
            {paymentType === 'partial' && (
              <>
                <label htmlFor="partialAmountInput">Partial payment amount</label>
                <input
                  id="partialAmountInput"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  placeholder="0.00"
                />
              </>
            )}
            <div className="paid-modal-actions">
              <button
                type="button"
                className="paid-modal-cancel-btn"
                onClick={closePaidModal}
                disabled={togglingPaid === paidModalInvoice._id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="paid-modal-save-btn"
                onClick={handleConfirmPaidDate}
                disabled={togglingPaid === paidModalInvoice._id}
              >
                {togglingPaid === paidModalInvoice._id ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrintPage;

