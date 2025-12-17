import React, { useState, useEffect } from 'react';
import { getDispatchers, getActiveDispatcher, createDispatcher, updateDispatcher, activateDispatcher, deleteDispatcher } from '../services/api';
import './DispatcherManager.css';

const DispatcherManager = () => {
  const [dispatchers, setDispatchers] = useState([]);
  const [activeDispatcher, setActiveDispatcher] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDispatcher, setEditingDispatcher] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    payableTo: {
      name: '',
      cityStateZip: '',
      phone: ''
    },
    isActive: false
  });

  useEffect(() => {
    loadDispatchers();
    loadActiveDispatcher();
  }, []);

  const loadDispatchers = async () => {
    try {
      const data = await getDispatchers();
      setDispatchers(data);
    } catch (error) {
      console.error('Failed to load dispatchers:', error);
    }
  };

  const loadActiveDispatcher = async () => {
    try {
      const data = await getActiveDispatcher();
      setActiveDispatcher(data);
    } catch (error) {
      // No active dispatcher is okay
      setActiveDispatcher(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDispatcher) {
        await updateDispatcher(editingDispatcher._id, formData);
      } else {
        await createDispatcher(formData);
      }
      
      setShowForm(false);
      setEditingDispatcher(null);
      setFormData({
        name: '',
        payableTo: {
          name: '',
          cityStateZip: '',
          phone: ''
        },
        isActive: false
      });
      loadDispatchers();
      loadActiveDispatcher();
    } catch (error) {
      alert('Failed to save dispatcher: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleEdit = (dispatcher) => {
    setEditingDispatcher(dispatcher);
    setFormData({
      name: dispatcher.name || '',
      payableTo: dispatcher.payableTo || {
        name: '',
        cityStateZip: '',
        phone: ''
      },
      isActive: dispatcher.isActive || false
    });
    setShowForm(true);
  };

  const handleActivate = async (id) => {
    try {
      await activateDispatcher(id);
      loadDispatchers();
      loadActiveDispatcher();
    } catch (error) {
      alert('Failed to activate dispatcher: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this dispatcher?')) {
      return;
    }
    try {
      await deleteDispatcher(id);
      loadDispatchers();
      loadActiveDispatcher();
    } catch (error) {
      alert('Failed to delete dispatcher: ' + (error.response?.data?.error || error.message));
    }
  };

  return (
    <div className="dispatcher-manager">
      <div className="manager-header">
        <h3>Dispatchers</h3>
        <div>
          {activeDispatcher && (
            <span className="active-badge">Active: {activeDispatcher.name}</span>
          )}
          <button onClick={() => {
            setShowForm(!showForm);
            if (showForm) {
              setEditingDispatcher(null);
              setFormData({
                name: '',
                payableTo: {
                  name: '',
                  cityStateZip: '',
                  phone: ''
                },
                isActive: false
              });
            }
          }} className="add-btn">
            {showForm ? 'Cancel' : '+ Add Dispatcher'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="dispatcher-form">
          <div className="form-group">
            <label>Dispatcher Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="form-section">
            <h4>Payable To Information</h4>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={formData.payableTo.name}
                onChange={(e) => setFormData({
                  ...formData,
                  payableTo: { ...formData.payableTo, name: e.target.value }
                })}
              />
            </div>
            <div className="form-group">
              <label>City, State ZIP</label>
              <input
                type="text"
                value={formData.payableTo.cityStateZip}
                onChange={(e) => setFormData({
                  ...formData,
                  payableTo: { ...formData.payableTo, cityStateZip: e.target.value }
                })}
              />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input
                type="text"
                value={formData.payableTo.phone}
                onChange={(e) => setFormData({
                  ...formData,
                  payableTo: { ...formData.payableTo, phone: e.target.value }
                })}
              />
            </div>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              />
              Set as Active Dispatcher
            </label>
          </div>

          <div className="form-actions">
            <button type="submit">{editingDispatcher ? 'Update' : 'Create'}</button>
            <button type="button" onClick={() => {
              setShowForm(false);
              setEditingDispatcher(null);
            }}>Cancel</button>
          </div>
        </form>
      )}

      <div className="dispatchers-list">
        {dispatchers.map(dispatcher => (
          <div key={dispatcher._id} className={`dispatcher-item ${dispatcher.isActive ? 'active' : ''}`}>
            <div className="dispatcher-info">
              <strong>{dispatcher.name}</strong>
              {dispatcher.isActive && <span className="active-badge">Active</span>}
              {dispatcher.payableTo && dispatcher.payableTo.name && (
                <div className="payable-to-info">
                  <small>Payable To: {dispatcher.payableTo.name}</small>
                </div>
              )}
            </div>
            <div className="dispatcher-actions">
              {!dispatcher.isActive && (
                <button onClick={() => handleActivate(dispatcher._id)} className="activate-btn">
                  Activate
                </button>
              )}
              <button onClick={() => handleEdit(dispatcher)} className="edit-btn">Edit</button>
              <button onClick={() => handleDelete(dispatcher._id)} className="delete-btn">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DispatcherManager;

