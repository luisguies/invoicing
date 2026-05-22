import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatDate, formatDateInput, parseDateInputToUtcDate } from '../utils/dateUtils';
import { updateLoad, cancelLoad, updateLoadCarrier, getCarriers, patchLoadDriver, markLoadAsInvoiced, patchLoadSubDispatcher } from '../services/api';
import RateConfirmationModal from './RateConfirmationModal';
import { getLoadTotalCarrierPay } from '../utils/loadPayUtils';
import './LoadItem.css';

const LoadItem = ({ load, onUpdate, onDelete, drivers = [], driversLoading = false, ensureDriversLoaded, subDispatchers = [] }) => {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [carriers, setCarriers] = useState([]);
  const [selectedCarrierId, setSelectedCarrierId] = useState('');
  const [saveAlias, setSaveAlias] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [rateConfirmationOpen, setRateConfirmationOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelTonuChecked, setCancelTonuChecked] = useState(false);
  const [cancelTonuAmount, setCancelTonuAmount] = useState('');
  const [formData, setFormData] = useState({
    load_number: load.load_number,
    carrier_pay: load.carrier_pay,
    tonu: !!load.tonu,
    detention_rate: load.detention_rate ?? '',
    pickup_date: formatDateInput(load.pickup_date),
    delivery_date: formatDateInput(load.delivery_date),
    pickup_city: load.pickup_city,
    pickup_state: load.pickup_state,
    delivery_city: load.delivery_city,
    delivery_state: load.delivery_state
  });

  const hasDriverConflicts = load.driver_conflict === true;
  const hasDuplicateConflicts = load.duplicate_conflict === true;
  const needsCarrierReview = !load.carrier_id && load.needs_review;
  const carrierId = load?.carrier_id?._id || null;
  const hasRateConfirmationPath = Boolean((load?.rate_confirmation_path || '').toString().trim());

  const driverConflictDetails = (() => {
    const ids = load.driver_conflict_ids;
    if (!Array.isArray(ids) || ids.length === 0) return null;
    // If populated, show load numbers; otherwise fall back to "N conflicting loads".
    const first = ids[0];
    const populated = first && typeof first === 'object' && !!first.load_number;
    if (populated) {
      const nums = ids.map((l) => l?.load_number).filter(Boolean);
      return nums.length > 0 ? `Driver conflict with load(s): ${nums.join(', ')}` : 'Driver conflict detected';
    }
    return `Driver conflict with ${ids.length} other load(s)`;
  })();

  const duplicateConflictDetails = (() => {
    const ids = load.duplicate_conflict_ids;
    if (!Array.isArray(ids) || ids.length === 0) return 'Duplicate load number for this carrier';
    return `Duplicate load number for this carrier (${ids.length + 1} total loads)`;
  })();

  const currentDriverId = (() => {
    if (!load?.driver_id) return null;
    if (typeof load.driver_id === 'string') return load.driver_id;
    return load.driver_id._id || null;
  })();

  const currentSubDispatcherId = (() => {
    if (!load?.sub_dispatcher_id) return '';
    if (typeof load.sub_dispatcher_id === 'string') return load.sub_dispatcher_id;
    return load.sub_dispatcher_id._id || '';
  })();

  // Load carriers when component mounts or when carrier_id is null
  useEffect(() => {
    if (needsCarrierReview) {
      loadCarriers();
    }
  }, [needsCarrierReview]);

  // Keep the dropdown in sync with the load prop
  useEffect(() => {
    setSelectedDriverId(currentDriverId ? currentDriverId.toString() : '');
  }, [currentDriverId]);

  // Lazily load drivers per carrier (cached in parent)
  useEffect(() => {
    if (carrierId && ensureDriversLoaded) {
      ensureDriversLoaded(carrierId.toString());
    }
  }, [carrierId, ensureDriversLoaded]);

  const driverList = Array.isArray(drivers) ? drivers : [];
  const selectedDriverIdStr = selectedDriverId ? String(selectedDriverId) : '';
  const driverIdsInList = new Set(driverList.map((d) => String(d._id)));
  const assignedDriverPopulated =
    load.driver_id && typeof load.driver_id === 'object' && load.driver_id._id != null
      ? load.driver_id
      : null;
  const showSelectedDriverNotInList =
    Boolean(selectedDriverIdStr) && !driverIdsInList.has(selectedDriverIdStr);

  const loadCarriers = async () => {
    try {
      const carriersList = await getCarriers();
      setCarriers(carriersList);
    } catch (error) {
      console.error('Failed to load carriers:', error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (!formData.pickup_date || !formData.delivery_date) {
        alert('Pickup and delivery dates are required.');
        return;
      }
      const pickupUtc = parseDateInputToUtcDate(formData.pickup_date);
      const deliveryUtc = parseDateInputToUtcDate(formData.delivery_date);
      if (!pickupUtc || !deliveryUtc) {
        alert('Invalid date format. Please use the date picker.');
        return;
      }
      const detentionRate =
        formData.detention_rate === '' || formData.detention_rate === null || formData.detention_rate === undefined
          ? 0
          : Number(formData.detention_rate);
      if (!Number.isFinite(detentionRate) || detentionRate < 0) {
        alert('Detention rate must be 0 or a positive number.');
        return;
      }
      const updatedLoad = await updateLoad(load._id, {
        ...formData,
        detention_rate: detentionRate,
        pickup_date: pickupUtc,
        delivery_date: deliveryUtc
      });
      onUpdate(updatedLoad, { refresh: true });
      setEditing(false);
    } catch (error) {
      alert('Failed to update load: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!load.cancelled && cancelTonuChecked) {
      const parsed = Number(cancelTonuAmount);
      if (!Number.isFinite(parsed) || parsed < 0) {
        alert('TONU amount must be 0 or a positive number.');
        return;
      }
    }
    setLoading(true);
    try {
      const options = cancelTonuChecked
        ? {
            tonuReceived: true,
            tonuAmount: cancelTonuAmount
          }
        : {};
      const updatedLoad = await cancelLoad(load._id, !load.cancelled, options);
      onUpdate(updatedLoad, { refresh: true });
      setCancelModalOpen(false);
      setCancelTonuChecked(false);
      setCancelTonuAmount('');
    } catch (error) {
      alert('Failed to update load: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsInvoiced = async (e) => {
    const newInvoicedStatus = e.target.checked;
    setLoading(true);
    try {
      const updatedLoad = await markLoadAsInvoiced(load._id, newInvoicedStatus);
      onUpdate(updatedLoad, { refresh: false });
    } catch (error) {
      // Revert checkbox on error
      e.target.checked = !newInvoicedStatus;
      alert('Failed to update load: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCarrierSelect = async () => {
    if (!selectedCarrierId) {
      alert('Please select a carrier');
      return;
    }

    setLoading(true);
    try {
      const updatedLoad = await updateLoadCarrier(load._id, selectedCarrierId, saveAlias);
      onUpdate(updatedLoad, { refresh: true });
      setSelectedCarrierId('');
      setSaveAlias(false);
    } catch (error) {
      alert('Failed to update carrier: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleDriverChange = async (e) => {
    const nextValue = e.target.value; // '' means unassigned
    const previousValue = selectedDriverId;

    setSelectedDriverId(nextValue);
    setLoading(true);
    try {
      const driverIdOrNull = nextValue ? nextValue : null;
      const updatedLoad = await patchLoadDriver(load._id, driverIdOrNull);
      onUpdate(updatedLoad, { refresh: false });
    } catch (error) {
      setSelectedDriverId(previousValue);
      alert('Failed to update driver: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSubDispatcherChange = async (e) => {
    const nextId = e.target.value || null;
    setLoading(true);
    try {
      const updatedLoad = await patchLoadSubDispatcher(load._id, nextId);
      onUpdate(updatedLoad, { refresh: false });
    } catch (error) {
      alert('Failed to update sub-dispatcher: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleViewRateConfirmation = () => {
    if (!hasRateConfirmationPath) return;
    setRateConfirmationOpen(true);
  };

  const openCancelModal = () => {
    setCancelTonuChecked(false);
    setCancelTonuAmount(load.tonu_received ? String(load.carrier_pay || '') : '');
    setCancelModalOpen(true);
  };

  const closeCancelModal = () => {
    if (loading) return;
    setCancelModalOpen(false);
  };

  const handleCancelButtonClick = () => {
    if (load.cancelled) {
      handleCancel();
      return;
    }
    openCancelModal();
  };

  const openEditModal = () => {
    setFormData({
      load_number: load.load_number,
      carrier_pay: load.carrier_pay,
      tonu: !!load.tonu,
      detention_rate: load.detention_rate ?? '',
      pickup_date: formatDateInput(load.pickup_date),
      delivery_date: formatDateInput(load.delivery_date),
      pickup_city: load.pickup_city,
      pickup_state: load.pickup_state,
      delivery_city: load.delivery_city,
      delivery_state: load.delivery_state
    });
    setEditing(true);
  };

  const closeEditModal = () => {
    if (loading) return;
    setEditing(false);
  };

  useEffect(() => {
    if (!editing) return undefined;

    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        closeEditModal();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [editing, loading]);

  useEffect(() => {
    if (!cancelModalOpen) return undefined;

    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        closeCancelModal();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [cancelModalOpen, loading]);

  return (
    <>
      <tr className={`load-item ${load.cancelled ? 'cancelled' : ''} ${hasDriverConflicts ? 'driver-conflict' : ''} ${hasDuplicateConflicts ? 'duplicate-conflict' : ''} ${needsCarrierReview ? 'needs-review' : ''}`}>
        <td data-label="Load #">
          {hasDriverConflicts && (
            <span className="warning-icon" title={driverConflictDetails || 'Driver conflict detected'}>👤⚠️</span>
          )}
          {hasDuplicateConflicts && (
            <span className="warning-icon" title={duplicateConflictDetails}>🔁</span>
          )}
          {needsCarrierReview && (
            <span className="warning-icon" title="Carrier needs review">🔍</span>
          )}
          {load.load_number}
        </td>
        <td data-label="Pickup Date">{formatDate(load.pickup_date)}</td>
        <td data-label="Delivery Date">{formatDate(load.delivery_date)}</td>
        <td data-label="Origin">{load.pickup_city}, {load.pickup_state}</td>
        <td data-label="Destination">{load.delivery_city}, {load.delivery_state}</td>
        <td className="amount" data-label="Amount">${getLoadTotalCarrierPay(load).toFixed(2)}</td>
        <td className="driver-cell" data-label="Driver">
          <select
            className="driver-dropdown"
            value={selectedDriverId}
            onChange={handleDriverChange}
            disabled={loading || !carrierId}
            title={!carrierId ? 'Assign a carrier first' : undefined}
          >
            <option value="">UNASSIGNED</option>
            {showSelectedDriverNotInList && (
              <option value={selectedDriverIdStr}>
                {driversLoading
                  ? 'Loading…'
                  : assignedDriverPopulated?.name
                    ? `${assignedDriverPopulated.name} (inactive)`
                    : 'Assigned (unknown)'}
              </option>
            )}
            {driverList.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>
        </td>
        <td className="sub-dispatcher-cell" data-label="Sub-dispatcher">
          <select
            className="sub-dispatcher-select"
            value={currentSubDispatcherId}
            onChange={handleSubDispatcherChange}
            disabled={loading}
            title="Assign or change sub-dispatcher"
          >
            <option value="">(None)</option>
            {subDispatchers.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>
        </td>
        <td className="carrier-cell" data-label="Carrier">
          {needsCarrierReview ? (
            <div className="carrier-selector">
              <div className="carrier-info">
                <span className="carrier-raw">Extracted: {load.carrier_raw_extracted || 'N/A'}</span>
              </div>
              <select
                value={selectedCarrierId}
                onChange={(e) => setSelectedCarrierId(e.target.value)}
                disabled={loading}
                className="carrier-dropdown"
              >
                <option value="">Select carrier...</option>
                {carriers.map((carrier) => (
                  <option key={carrier._id} value={carrier._id}>
                    {carrier.name}
                  </option>
                ))}
              </select>
              {selectedCarrierId && load.carrier_raw_extracted && (
                <label className="alias-checkbox">
                  <input
                    type="checkbox"
                    checked={saveAlias}
                    onChange={(e) => setSaveAlias(e.target.checked)}
                    disabled={loading}
                  />
                  Save '{load.carrier_raw_extracted}' as an alias for this carrier
                </label>
              )}
              <button
                onClick={handleCarrierSelect}
                disabled={loading || !selectedCarrierId}
                className="confirm-carrier-btn"
              >
                Confirm
              </button>
            </div>
          ) : (
            <span className="carrier-name">
              {load.carrier_id?.name || 'No carrier'}
            </span>
          )}
        </td>
        <td className="invoiced-cell" data-label="Invoiced">
          <input
            type="checkbox"
            checked={load.invoiced || false}
            onChange={handleMarkAsInvoiced}
            disabled={loading}
            title={load.invoiced ? 'Mark as not invoiced' : 'Mark as invoiced'}
            className="invoiced-checkbox"
          />
        </td>
        <td className="actions" data-label="Actions">
          <button
            onClick={handleViewRateConfirmation}
            disabled={loading || !hasRateConfirmationPath}
            className="view-rate-confirmation-btn"
            title={hasRateConfirmationPath ? 'View rate confirmation' : 'Rate confirmation is not available'}
          >
            View Rate Confirmation
          </button>
          <button
            className={load.cancelled ? 'uncancel-btn' : 'cancel-btn'}
            onClick={handleCancelButtonClick}
            disabled={loading}
          >
            {load.cancelled ? 'Uncancel' : 'Cancel'}
          </button>
          <button onClick={openEditModal} disabled={loading}>Edit</button>
          {onDelete && (
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this load?')) {
                  onDelete(load._id);
                }
              }}
              disabled={loading}
              className="delete-btn"
            >
              Delete
            </button>
          )}
        </td>
      </tr>

      {editing && typeof document !== 'undefined' && createPortal(
        <div className="load-edit-modal-backdrop" onClick={closeEditModal}>
          <div className="load-edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Load {load.load_number}</h3>
            <div className="load-edit-grid">
              <label>
                Load #
                <input
                  type="text"
                  value={formData.load_number}
                  onChange={(e) => setFormData({ ...formData, load_number: e.target.value })}
                  disabled={loading}
                />
              </label>
              <label>
                Carrier Pay
                <input
                  type="number"
                  step="0.01"
                  value={formData.carrier_pay}
                  onChange={(e) => setFormData({ ...formData, carrier_pay: e.target.value })}
                  disabled={loading}
                />
              </label>
              <label>
                Detention Rate
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.detention_rate}
                  onChange={(e) => setFormData({ ...formData, detention_rate: e.target.value })}
                  disabled={loading}
                />
              </label>
              <label className="load-edit-checkbox load-edit-span-two">
                <span>TONU</span>
                <input
                  type="checkbox"
                  checked={!!formData.tonu}
                  onChange={(e) => setFormData({ ...formData, tonu: e.target.checked })}
                  disabled={loading}
                />
              </label>
              <label>
                Pickup Date
                <input
                  type="date"
                  id={`pickup-date-${load._id}`}
                  name="pickup_date"
                  value={formData.pickup_date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, pickup_date: e.target.value }))}
                  disabled={loading}
                />
              </label>
              <label>
                Delivery Date
                <input
                  type="date"
                  id={`delivery-date-${load._id}`}
                  name="delivery_date"
                  value={formData.delivery_date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, delivery_date: e.target.value }))}
                  disabled={loading}
                />
              </label>
              <label>
                Pickup City
                <input
                  type="text"
                  value={formData.pickup_city}
                  onChange={(e) => setFormData({ ...formData, pickup_city: e.target.value })}
                  disabled={loading}
                />
              </label>
              <label>
                Pickup State
                <input
                  type="text"
                  value={formData.pickup_state}
                  onChange={(e) => setFormData({ ...formData, pickup_state: e.target.value })}
                  disabled={loading}
                />
              </label>
              <label>
                Delivery City
                <input
                  type="text"
                  value={formData.delivery_city}
                  onChange={(e) => setFormData({ ...formData, delivery_city: e.target.value })}
                  disabled={loading}
                />
              </label>
              <label>
                Delivery State
                <input
                  type="text"
                  value={formData.delivery_state}
                  onChange={(e) => setFormData({ ...formData, delivery_state: e.target.value })}
                  disabled={loading}
                />
              </label>
            </div>
            <div className="load-edit-modal-actions">
              <button onClick={closeEditModal} disabled={loading}>Cancel</button>
              <button className="save-btn" onClick={handleSave} disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {cancelModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="load-edit-modal-backdrop" onClick={closeCancelModal}>
          <div className="load-edit-modal cancel-load-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Cancel Load {load.load_number}</h3>
            <p className="cancel-load-help">
              Cancelling removes the load from normal invoice generation and conflict checks.
            </p>
            <label className="load-edit-checkbox">
              <span>Add TONU</span>
              <input
                type="checkbox"
                checked={cancelTonuChecked}
                onChange={(e) => setCancelTonuChecked(e.target.checked)}
                disabled={loading}
              />
            </label>
            {cancelTonuChecked && (
              <label>
                TONU Amount
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cancelTonuAmount}
                  onChange={(e) => setCancelTonuAmount(e.target.value)}
                  disabled={loading}
                />
              </label>
            )}
            <div className="load-edit-modal-actions">
              <button onClick={closeCancelModal} disabled={loading}>Back</button>
              <button className="save-btn" onClick={handleCancel} disabled={loading}>
                {loading ? 'Saving...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {rateConfirmationOpen && (
        <RateConfirmationModal
          loadId={load._id}
          loadNumber={load.load_number}
          onClose={() => setRateConfirmationOpen(false)}
        />
      )}
    </>
  );
};

export default LoadItem;

