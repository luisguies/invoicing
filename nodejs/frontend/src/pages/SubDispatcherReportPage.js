import React, { useEffect, useState } from 'react';
import { getDispatchers, getSettings, getSubDispatcherReport } from '../services/api';
import { formatDate } from '../utils/dateUtils';
import { getLoadTotalCarrierPay } from '../utils/loadPayUtils';
import './SubDispatcherReportPage.css';

const SubDispatcherReportPage = () => {
  const [subDispatchers, setSubDispatchers] = useState([]);
  const [subDispatcherId, setSubDispatcherId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [excludeCancelled, setExcludeCancelled] = useState(true);
  const [ratePercent, setRatePercent] = useState('');
  const [loads, setLoads] = useState([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [allDispatchers, settings] = await Promise.all([
          getDispatchers(),
          getSettings().catch(() => null),
        ]);
        const onlySubDispatchers = (allDispatchers || []).filter((d) => d.parent_id);
        setSubDispatchers(onlySubDispatchers);
        if (onlySubDispatchers.length > 0) {
          setSubDispatcherId(onlySubDispatchers[0]._id);
        }
        if (settings?.defaultRate != null) {
          setRatePercent(String(settings.defaultRate));
        }
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to load sub-dispatchers');
      }
    };
    fetchInitialData();
  }, []);

  const handleGenerate = async () => {
    if (!subDispatcherId) {
      setError('Select a sub-dispatcher');
      return;
    }

    setLoading(true);
    setLoaded(false);
    setError('');

    try {
      const report = await getSubDispatcherReport(
        subDispatcherId,
        dateFrom || undefined,
        dateTo || undefined,
        excludeCancelled
      );
      setLoads(report.loads || []);
      setTotalAmount(Number(report.totalAmount) || 0);
      setLoaded(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to generate report');
      setLoads([]);
      setTotalAmount(0);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const selectedSubDispatcher = subDispatchers.find((d) => d._id === subDispatcherId);

  const parsedRatePercent = parseFloat(ratePercent);
  const ratePercentValid =
    ratePercent !== '' && Number.isFinite(parsedRatePercent) && parsedRatePercent >= 0;
  const subDispatcherPay = ratePercentValid ? totalAmount * (parsedRatePercent / 100) : null;

  return (
    <div className="sub-dispatcher-report-page">
      <h2>Sub-dispatcher Report</h2>
      <p className="page-description">
        Generate and print a report of loads created by a sub-dispatcher, filtered by date range.
      </p>

      <div className="report-form no-print">
        <div className="form-row">
          <label htmlFor="subDispatcher">Sub-dispatcher</label>
          <select
            id="subDispatcher"
            value={subDispatcherId}
            onChange={(e) => setSubDispatcherId(e.target.value)}
            disabled={loading}
          >
            <option value="">Select sub-dispatcher...</option>
            {subDispatchers.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row date-row">
          <div>
            <label htmlFor="fromDate">From date</label>
            <input
              id="fromDate"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor="toDate">To date</label>
            <input
              id="toDate"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>
        <div className="form-row checkbox-row">
          <label htmlFor="excludeCancelled" className="checkbox-label">
            <input
              id="excludeCancelled"
              type="checkbox"
              checked={excludeCancelled}
              onChange={(e) => setExcludeCancelled(e.target.checked)}
              disabled={loading}
            />
            Exclude cancelled loads
          </label>
        </div>

        <div className="form-row rate-row">
          <label htmlFor="ratePercent">Sub-dispatcher rate (%)</label>
          <input
            id="ratePercent"
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={ratePercent}
            onChange={(e) => setRatePercent(e.target.value)}
            disabled={loading}
            placeholder="e.g. 5"
          />
        </div>

        <div className="form-actions">
          <button type="button" className="generate-btn" onClick={handleGenerate} disabled={loading}>
            {loading ? 'Loading...' : 'Generate report'}
          </button>
          {loaded && loads.length > 0 && (
            <button type="button" className="print-btn" onClick={handlePrint}>
              Print report
            </button>
          )}
        </div>
      </div>

      {error && <div className="message error no-print">{error}</div>}

      {loaded && (
        <div className="report-results">
          {loads.length === 0 ? (
            <p className="no-loads">No loads found for the selected sub-dispatcher and date range.</p>
          ) : (
            <>
              <div className="report-header print-only">
                <h3>Sub-dispatcher report: {selectedSubDispatcher?.name || 'Sub-dispatcher'}</h3>
                <p className="report-date-range">
                  {dateFrom && dateTo
                    ? `${formatDate(dateFrom)} - ${formatDate(dateTo)}`
                    : dateFrom
                      ? `From ${formatDate(dateFrom)}`
                      : dateTo
                        ? `Through ${formatDate(dateTo)}`
                        : 'All dates'}
                </p>
                {ratePercentValid && (
                  <p className="report-rate-summary">
                    Sub-dispatcher rate: {parsedRatePercent}% — ${subDispatcherPay.toFixed(2)}
                  </p>
                )}
              </div>

              <table className="report-table">
                <thead>
                  <tr>
                    <th>Load #</th>
                    <th>Carrier</th>
                    <th>Driver</th>
                    <th>Pickup date</th>
                    <th>Delivery date</th>
                    <th>Origin</th>
                    <th>Destination</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {loads.map((load) => (
                    <tr key={load._id} className={load.cancelled ? 'cancelled' : ''}>
                      <td data-label="Load #">{load.load_number}</td>
                      <td data-label="Carrier">{load.carrier_id?.name || '-'}</td>
                      <td data-label="Driver">{load.driver_id?.name || '-'}</td>
                      <td data-label="Pickup date">{formatDate(load.pickup_date)}</td>
                      <td data-label="Delivery date">{formatDate(load.delivery_date)}</td>
                      <td data-label="Origin">{[load.pickup_city, load.pickup_state].filter(Boolean).join(', ') || '-'}</td>
                      <td data-label="Destination">{[load.delivery_city, load.delivery_state].filter(Boolean).join(', ') || '-'}</td>
                      <td className="num" data-label="Amount">${getLoadTotalCarrierPay(load).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="7" className="total-label">Total generated</td>
                    <td className="num total-amount">${totalAmount.toFixed(2)}</td>
                  </tr>
                  {ratePercentValid && (
                    <tr className="rate-total-row">
                      <td colSpan="7" className="total-label">
                        Sub-dispatcher rate ({parsedRatePercent}%)
                      </td>
                      <td className="num total-amount rate-amount">${subDispatcherPay.toFixed(2)}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SubDispatcherReportPage;
