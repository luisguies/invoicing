import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getDrivers, getCarriers, createDriver, updateDriver, deleteDriver } from '../services/api';
import { DRIVER_BOARD_TAGS } from '../constants/driverBoardTags';
import './DriverManager.css';

const emptyForm = () => ({
  name: '',
  aliases: '',
  groupLabel: '',
  carrier_id: '',
  color: '',
  phone: '',
  truckNumber: '',
  trailerNumber: '',
  tagTarp4ft: false,
  tagTarp6ft: false,
  tagTarp8ft: false,
  tagTwic: false,
  tagTanker: false,
  tagPipeStakes: false,
  hardwood4x4Count: '',
  softwood4x4Count: '',
  chainCount: '',
  coilRackCount: '',
  active: true
});

const DriverManager = () => {
  const [drivers, setDrivers] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  const sortedDrivers = useMemo(() => {
    return [...drivers].sort((a, b) => {
      const carrierA = (a.carrier_id?.name || '').toLowerCase();
      const carrierB = (b.carrier_id?.name || '').toLowerCase();
      if (carrierA !== carrierB) return carrierA.localeCompare(carrierB);
      return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
    });
  }, [drivers]);

  useEffect(() => {
    loadDrivers();
    loadCarriers();
  }, []);

  const loadDrivers = async () => {
    try {
      const data = await getDrivers();
      setDrivers(data);
    } catch (error) {
      console.error('Failed to load drivers:', error);
    }
  };

  const loadCarriers = async () => {
    try {
      const data = await getCarriers();
      setCarriers(data);
    } catch (error) {
      console.error('Failed to load carriers:', error);
    }
  };

  const buildSubmitPayload = () => {
    const submitData = {
      ...formData,
      aliases: formData.aliases ? formData.aliases.split(',').map((a) => a.trim()).filter((a) => a) : []
    };
    const countKeys = ['hardwood4x4Count', 'softwood4x4Count', 'chainCount', 'coilRackCount'];
    for (const k of countKeys) {
      const v = submitData[k];
      if (v === '' || v === null || v === undefined) {
        submitData[k] = null;
      } else {
        const n = parseInt(String(v), 10);
        submitData[k] = Number.isFinite(n) && n >= 0 ? n : null;
      }
    }
    return submitData;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const submitData = buildSubmitPayload();

      if (editingDriver) {
        await updateDriver(editingDriver._id, submitData);
      } else {
        await createDriver(submitData);
      }

      setFormModalOpen(false);
      setEditingDriver(null);
      setFormData(emptyForm());
      loadDrivers();
    } catch (error) {
      alert('Failed to save driver: ' + (error.response?.data?.error || error.message));
    }
  };

  const driverToForm = (driver) => ({
    name: driver.name || '',
    aliases: driver.aliases ? driver.aliases.join(', ') : '',
    groupLabel: driver.groupLabel || '',
    carrier_id: driver.carrier_id?._id || driver.carrier_id || '',
    color: driver.color || '',
    phone: driver.phone || '',
    truckNumber: driver.truckNumber || '',
    trailerNumber: driver.trailerNumber || '',
    tagTarp4ft: !!driver.tagTarp4ft,
    tagTarp6ft: !!driver.tagTarp6ft,
    tagTarp8ft: !!driver.tagTarp8ft,
    tagTwic: !!driver.tagTwic,
    tagTanker: !!driver.tagTanker,
    tagPipeStakes: !!driver.tagPipeStakes,
    hardwood4x4Count: driver.hardwood4x4Count != null ? String(driver.hardwood4x4Count) : '',
    softwood4x4Count: driver.softwood4x4Count != null ? String(driver.softwood4x4Count) : '',
    chainCount: driver.chainCount != null ? String(driver.chainCount) : '',
    coilRackCount: driver.coilRackCount != null ? String(driver.coilRackCount) : '',
    active: driver.active !== false
  });

  const closeFormModal = useCallback(() => {
    setFormModalOpen(false);
    setEditingDriver(null);
    setFormData(emptyForm());
  }, []);

  useEffect(() => {
    if (!formModalOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeFormModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [formModalOpen, closeFormModal]);

  const handleEdit = (driver) => {
    setEditingDriver(driver);
    setFormData(driverToForm(driver));
    setFormModalOpen(true);
  };

  const openAddModal = () => {
    setEditingDriver(null);
    setFormData(emptyForm());
    setFormModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this driver?')) {
      return;
    }
    try {
      await deleteDriver(id);
      loadDrivers();
    } catch (error) {
      alert('Failed to delete driver: ' + (error.response?.data?.error || error.message));
    }
  };

  return (
    <div className="driver-manager">
      <div className="manager-header">
        <h3>Drivers</h3>
        <button type="button" onClick={openAddModal} className="add-btn">
          + Add Driver
        </button>
      </div>

      {formModalOpen && (
        <div
          className="driver-modal-overlay"
          role="presentation"
          onClick={closeFormModal}
        >
          <div
            className="driver-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="driver-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="driver-modal-header">
              <h3 id="driver-modal-title">{editingDriver ? 'Edit driver' : 'Add driver'}</h3>
              <button type="button" className="driver-modal-close" onClick={closeFormModal} aria-label="Close">
                ×
              </button>
            </div>
            <div className="driver-modal-body">
        <form onSubmit={handleSubmit} className="driver-form">
          <div className="form-section">
            <h4>Basic</h4>
            <div className="form-group">
              <label>Driver name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>Group label</label>
              <input
                type="text"
                value={formData.groupLabel}
                onChange={(e) => setFormData({ ...formData, groupLabel: e.target.value })}
                placeholder="Label used in invoice tables (defaults to driver name if empty)"
              />
            </div>

            <div className="form-group">
              <label>Aliases (comma-separated)</label>
              <input
                type="text"
                value={formData.aliases}
                onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
                placeholder="Alias1, Alias2, ..."
              />
            </div>

            <div className="form-group">
              <label>Carrier *</label>
              <select
                value={formData.carrier_id}
                onChange={(e) => setFormData({ ...formData, carrier_id: e.target.value })}
                required
              >
                <option value="">Select carrier</option>
                {carriers.map((carrier) => (
                  <option key={carrier._id} value={carrier._id}>
                    {carrier.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Calendar color</label>
              <div className="color-picker-container">
                <input
                  type="color"
                  value={formData.color || '#cccccc'}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="color-picker"
                />
                <input
                  type="text"
                  value={formData.color || ''}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#cccccc"
                  className="color-input"
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, color: '' })}
                  className="clear-color-btn"
                  title="Clear color (use auto-generated)"
                >
                  Clear
                </button>
              </div>
              <small className="form-help-text">
                Color used for this driver in the calendar view. Leave empty for auto-generated color.
              </small>
            </div>
          </div>

          <div className="form-section">
            <h4>Driver board — contact &amp; equipment IDs</h4>
            <p className="form-section-hint">Shown on the driver board. Carrier-level credentials are edited under Carriers.</p>
            <div className="form-group">
              <label>Cell #</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="XXX-XXX-XXXX"
                autoComplete="off"
              />
            </div>
            <div className="form-group form-row-two">
              <div>
                <label>Truck #</label>
                <input
                  type="text"
                  value={formData.truckNumber}
                  onChange={(e) => setFormData({ ...formData, truckNumber: e.target.value })}
                  autoComplete="off"
                />
              </div>
              <div>
                <label>Trailer #</label>
                <input
                  type="text"
                  value={formData.trailerNumber}
                  onChange={(e) => setFormData({ ...formData, trailerNumber: e.target.value })}
                  autoComplete="off"
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h4>Driver board — tags</h4>
            <p className="form-section-hint">Only checked tags appear on the driver board.</p>
            <div className="checkbox-grid">
              {DRIVER_BOARD_TAGS.map(({ key, label }) => (
                <label key={key} className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={!!formData[key]}
                    onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="form-section">
            <h4>Driver board — counts</h4>
            <div className="form-group form-row-four">
              <div>
                <label>4×4 hardwood</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.hardwood4x4Count}
                  onChange={(e) => setFormData({ ...formData, hardwood4x4Count: e.target.value })}
                />
              </div>
              <div>
                <label>4×4 softwood</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.softwood4x4Count}
                  onChange={(e) => setFormData({ ...formData, softwood4x4Count: e.target.value })}
                />
              </div>
              <div>
                <label>Chains</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.chainCount}
                  onChange={(e) => setFormData({ ...formData, chainCount: e.target.value })}
                />
              </div>
              <div>
                <label>Coil racks</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.coilRackCount}
                  onChange={(e) => setFormData({ ...formData, coilRackCount: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h4>Status</h4>
            <label className="checkbox-inline status-inactive">
              <input
                type="checkbox"
                checked={formData.active === false}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked ? false : true })}
              />
              Inactive (hidden from driver board)
            </label>
          </div>

          <div className="form-actions">
            <button type="submit">{editingDriver ? 'Update' : 'Create'}</button>
            <button type="button" onClick={closeFormModal}>
              Cancel
            </button>
          </div>
        </form>
            </div>
          </div>
        </div>
      )}

      <div className="drivers-list">
        {sortedDrivers.map((driver) => (
          <div key={driver._id} className="driver-item">
            <div className="driver-info">
              <div className="driver-name-row">
                {driver.color && (
                  <span
                    className="driver-color-indicator"
                    style={{ backgroundColor: driver.color }}
                    title={`Calendar color: ${driver.color}`}
                  />
                )}
                <strong>{driver.name}</strong>
                {driver.active === false && <span className="driver-inactive-badge">Inactive</span>}
              </div>
              {driver.groupLabel && <span className="group-label"> (Group: {driver.groupLabel})</span>}
              {driver.aliases && driver.aliases.length > 0 && (
                <span className="aliases"> — Aliases: {driver.aliases.join(', ')}</span>
              )}
              {driver.carrier_id && (
                <div className="carrier-info">
                  <small>Carrier: {driver.carrier_id.name}</small>
                </div>
              )}
            </div>
            <div className="driver-actions">
              <button onClick={() => handleEdit(driver)} className="edit-btn">
                Edit
              </button>
              <button onClick={() => handleDelete(driver._id)} className="delete-btn">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DriverManager;
