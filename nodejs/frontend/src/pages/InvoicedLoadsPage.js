import React, { useState, useEffect } from 'react';
import { searchInvoicedLoads, getCarriers, getDrivers } from '../services/api';
import { formatDate } from '../utils/dateUtils';
import './InvoicedLoadsPage.css';

const InvoicedLoadsPage = () => {
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [carriers, setCarriers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [filters, setFilters] = useState({
    carrier_id: '',
    load_number: '',
    driver_id: ''
  });

  useEffect(() => {
    loadCarriers();
    loadDrivers();
    // Load all invoiced loads initially
    performSearch({});
  }, []);

  const loadCarriers = async () => {
    try {
      const data = await getCarriers();
      setCarriers(data || []);
    } catch (error) {
      console.error('Failed to load carriers:', error);
    }
  };

  const loadDrivers = async () => {
    try {
      const data = await getDrivers();
      setDrivers(data || []);
    } catch (error) {
      console.error('Failed to load drivers:', error);
    }
  };

  const performSearch = async (searchFilters = null) => {
    setLoading(true);
    try {
      const filtersToUse = searchFilters !== null ? searchFilters : filters;
      // Remove empty filters
      const cleanFilters = {};
      if (filtersToUse.carrier_id) cleanFilters.carrier_id = filtersToUse.carrier_id;
      if (filtersToUse.load_number) cleanFilters.load_number = filtersToUse.load_number;
      if (filtersToUse.driver_id) cleanFilters.driver_id = filtersToUse.driver_id;

      const data = await searchInvoicedLoads(cleanFilters);
      setLoads(data || []);
    } catch (error) {
      alert('Failed to search invoiced loads: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    performSearch(filters);
  };

  const handleClear = () => {
    const emptyFilters = {
      carrier_id: '',
      load_number: '',
      driver_id: ''
    };
    setFilters(emptyFilters);
    performSearch(emptyFilters);
  };

  return (
    <div className="invoiced-loads-page">
      <div className="page-header">
        <h2>Invoiced Loads</h2>
        <button onClick={handleClear} className="refresh-btn">
          Clear Search
        </button>
      </div>

      <form className="search-form" onSubmit={handleSearch}>
        <div className="search-fields">
          <div className="search-field">
            <label htmlFor="carrier">Carrier:</label>
            <select
              id="carrier"
              value={filters.carrier_id}
              onChange={(e) => handleFilterChange('carrier_id', e.target.value)}
            >
              <option value="">All Carriers</option>
              {carriers.map(carrier => (
                <option key={carrier._id} value={carrier._id}>
                  {carrier.name}
                </option>
              ))}
            </select>
          </div>

          <div className="search-field">
            <label htmlFor="load_number">Load Number:</label>
            <input
              id="load_number"
              type="text"
              value={filters.load_number}
              onChange={(e) => handleFilterChange('load_number', e.target.value)}
              placeholder="Enter load number"
            />
          </div>

          <div className="search-field">
            <label htmlFor="driver">Driver:</label>
            <select
              id="driver"
              value={filters.driver_id}
              onChange={(e) => handleFilterChange('driver_id', e.target.value)}
            >
              <option value="">All Drivers</option>
              {drivers.map(driver => (
                <option key={driver._id} value={driver._id}>
                  {driver.name}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="search-btn" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="loading">Searching invoiced loads...</div>
      ) : loads.length === 0 ? (
        <div className="no-loads">No invoiced loads found matching your search criteria.</div>
      ) : (
        <div className="loads-table-container">
          <table className="invoiced-loads-table">
            <thead>
              <tr>
                <th>Load #</th>
                <th>Carrier</th>
                <th>Driver</th>
                <th>Pickup Date</th>
                <th>Delivery Date</th>
                <th>Origin</th>
                <th>Destination</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {loads.map(load => (
                <tr key={load._id}>
                  <td>{load.load_number}</td>
                  <td>{load.carrier_id?.name || 'N/A'}</td>
                  <td>{load.driver_id?.name || 'N/A'}</td>
                  <td>{formatDate(load.pickup_date)}</td>
                  <td>{formatDate(load.delivery_date)}</td>
                  <td>{load.pickup_city}, {load.pickup_state}</td>
                  <td>{load.delivery_city}, {load.delivery_state}</td>
                  <td>${Number(load.carrier_pay || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="results-count">
            Found {loads.length} invoiced load{loads.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoicedLoadsPage;
