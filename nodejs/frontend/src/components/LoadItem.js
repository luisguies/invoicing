import React, { useState, useEffect } from 'react';
import { formatDate, formatDateInput } from '../utils/dateUtils';
import { updateLoad, cancelLoad, confirmLoad, updateLoadCarrier, getCarriers } from '../services/api';
import './LoadItem.css';

const LoadItem = ({ load, onUpdate, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [carriers, setCarriers] = useState([]);
  const [selectedCarrierId, setSelectedCarrierId] = useState('');
  const [saveAlias, setSaveAlias] = useState(false);
  const [formData, setFormData] = useState({
    load_number: load.load_number,
    carrier_pay: load.carrier_pay,
    pickup_date: formatDateInput(load.pickup_date),
    delivery_date: formatDateInput(load.delivery_date),
    pickup_city: load.pickup_city,
    pickup_state: load.pickup_state,
    delivery_city: load.delivery_city,
    delivery_state: load.delivery_state
  });

  const hasConflicts = load.date_conflict_ids && load.date_conflict_ids.length > 0;
  const needsConfirmation = hasConflicts && !load.confirmed;
  const needsCarrierReview = !load.carrier_id && load.needs_review;

  // Load carriers when component mounts or when carrier_id is null
  useEffect(() => {
    if (needsCarrierReview) {
      loadCarriers();
    }
  }, [needsCarrierReview]);

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
      const updatedLoad = await updateLoad(load._id, {
        ...formData,
        pickup_date: new Date(formData.pickup_date),
        delivery_date: new Date(formData.delivery_date)
      });
      onUpdate(updatedLoad);
      setEditing(false);
    } catch (error) {
      alert('Failed to update load: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      const updatedLoad = await cancelLoad(load._id, !load.cancelled);
      onUpdate(updatedLoad);
    } catch (error) {
      alert('Failed to update load: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const updatedLoad = await confirmLoad(load._id);
      onUpdate(updatedLoad);
    } catch (error) {
      alert('Failed to confirm load: ' + (error.response?.data?.error || error.message));
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
      onUpdate(updatedLoad);
      setSelectedCarrierId('');
      setSaveAlias(false);
    } catch (error) {
      alert('Failed to update carrier: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  if (editing) {
    return (
      <tr className={`load-item editing ${load.cancelled ? 'cancelled' : ''}`}>
        <td>
          <input
            type="text"
            value={formData.load_number}
            onChange={(e) => setFormData({ ...formData, load_number: e.target.value })}
          />
        </td>
        <td>
          <input
            type="date"
            value={formData.pickup_date}
            onChange={(e) => setFormData({ ...formData, pickup_date: e.target.value })}
          />
        </td>
        <td>
          <input
            type="date"
            value={formData.delivery_date}
            onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
          />
        </td>
        <td>
          <input
            type="text"
            value={formData.pickup_city}
            onChange={(e) => setFormData({ ...formData, pickup_city: e.target.value })}
            placeholder="City"
          />
          <input
            type="text"
            value={formData.pickup_state}
            onChange={(e) => setFormData({ ...formData, pickup_state: e.target.value })}
            placeholder="State"
            style={{ width: '60px', marginLeft: '4px' }}
          />
        </td>
        <td>
          <input
            type="text"
            value={formData.delivery_city}
            onChange={(e) => setFormData({ ...formData, delivery_city: e.target.value })}
            placeholder="City"
          />
          <input
            type="text"
            value={formData.delivery_state}
            onChange={(e) => setFormData({ ...formData, delivery_state: e.target.value })}
            placeholder="State"
            style={{ width: '60px', marginLeft: '4px' }}
          />
        </td>
        <td>
          <input
            type="number"
            step="0.01"
            value={formData.carrier_pay}
            onChange={(e) => setFormData({ ...formData, carrier_pay: parseFloat(e.target.value) })}
          />
        </td>
        <td>
          <button onClick={handleSave} disabled={loading}>Save</button>
          <button onClick={() => setEditing(false)} disabled={loading}>Cancel</button>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`load-item ${load.cancelled ? 'cancelled' : ''} ${needsConfirmation ? 'needs-confirmation' : ''} ${needsCarrierReview ? 'needs-review' : ''}`}>
      <td>
        {hasConflicts && (
          <span className="warning-icon" title="Date conflict detected">⚠️</span>
        )}
        {needsCarrierReview && (
          <span className="warning-icon" title="Carrier needs review">🔍</span>
        )}
        {load.load_number}
      </td>
      <td>{formatDate(load.pickup_date)}</td>
      <td>{formatDate(load.delivery_date)}</td>
      <td>{load.pickup_city}, {load.pickup_state}</td>
      <td>{load.delivery_city}, {load.delivery_state}</td>
      <td className="amount">${load.carrier_pay?.toFixed(2)}</td>
      <td className="carrier-cell">
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
      <td className="actions">
        {needsConfirmation && (
          <button
            className="confirm-btn"
            onClick={handleConfirm}
            disabled={loading}
            title="Confirm this load (required due to date conflicts)"
          >
            Confirm
          </button>
        )}
        <button
          className={load.cancelled ? 'uncancel-btn' : 'cancel-btn'}
          onClick={handleCancel}
          disabled={loading}
        >
          {load.cancelled ? 'Uncancel' : 'Cancel'}
        </button>
        <button onClick={() => setEditing(true)} disabled={loading}>Edit</button>
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
  );
};

export default LoadItem;

