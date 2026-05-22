import React, { useState } from 'react';
import { formatDate } from '../utils/dateUtils';
import { DRIVER_BOARD_TAGS } from '../constants/driverBoardTags';
import RateConfirmationModal from '../components/RateConfirmationModal';
import './DriverBoardView.css';

function formatPhone(value) {
  if (value == null || value === '') return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return String(value).trim();
}

function formatCityState(city, state) {
  const parts = [city, state].filter((x) => x != null && String(x).trim() !== '');
  return parts.length ? parts.join(', ') : '';
}

function CurrentLoadCell({ load, onOpenRateConfirmation }) {
  if (!load) return '—';
  const num = load.load_number != null ? String(load.load_number) : '';
  const pu = formatCityState(load.pickup_city, load.pickup_state);
  const del = formatCityState(load.delivery_city, load.delivery_state);
  const puDate = formatDate(load.pickup_date);
  const delDate = formatDate(load.delivery_date);
  const hasAny = num || pu || puDate || del || delDate;
  if (!hasAny) return '—';

  const hasPdf = Boolean((load.rate_confirmation_path || '').toString().trim()) && load._id;

  const inner = (
    <div className="current-load-block">
      {num ? (
        <div className="current-load-line">
          <strong>Load #{num}</strong>
        </div>
      ) : null}
      {pu || puDate ? (
        <div className="current-load-line">
          Pickup: {pu || '—'}
          {puDate ? ` · ${puDate}` : ''}
        </div>
      ) : null}
      {del || delDate ? (
        <div className="current-load-line">
          Delivery: {del || '—'}
          {delDate ? ` · ${delDate}` : ''}
        </div>
      ) : null}
    </div>
  );

  if (hasPdf) {
    return (
      <button
        type="button"
        className="current-load-link"
        onClick={() => onOpenRateConfirmation(load)}
      >
        {inner}
      </button>
    );
  }
  return inner;
}

function formatCount(n) {
  if (n == null || n === '') return '—';
  const x = Number(n);
  return Number.isFinite(x) ? String(x) : '—';
}

function format4x4Column(d) {
  const hw = formatCount(d.hardwood4x4Count);
  const sw = formatCount(d.softwood4x4Count);
  if (hw === '—' && sw === '—') return '—';
  return `HW: ${hw} / SW: ${sw}`;
}

function DriverTagPills({ driver }) {
  const active = DRIVER_BOARD_TAGS.filter(({ key }) => driver[key]);
  if (!active.length) return '—';
  return (
    <span className="tag-pill-wrap">
      {active.map(({ key, label }) => (
        <span key={key} className="tag-pill">
          {label}
        </span>
      ))}
    </span>
  );
}

/** Same calendar day as "today" in UTC (matches formatDate / stored load dates). */
function isDeliveryDateUtcToday(load) {
  if (!load?.delivery_date) return false;
  const d = new Date(load.delivery_date);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

function getDriverBoardRowStatusClass(d) {
  const cur = d.currentLoad;
  const next = d.nextLoad;
  if (cur && next) return 'driver-board-row--green';
  if (!cur && !next) return 'driver-board-row--red';
  if (!next && cur && isDeliveryDateUtcToday(cur)) return 'driver-board-row--yellow';
  return '';
}

export default function DriverBoardView({ drivers = [], loading, error }) {
  const [rcLoad, setRcLoad] = useState(null);

  const handleOpenRateConfirmation = (load) => {
    if (!load?._id) return;
    setRcLoad({ _id: load._id, load_number: load.load_number });
  };

  if (loading) {
    return <div className="driver-board-loading">Loading driver board…</div>;
  }

  if (error) {
    return <div className="driver-board-error">{error}</div>;
  }

  return (
    <div className="driver-board-wrap">
      <table className="driver-board-table">
        <thead>
          <tr>
            <th>Carrier name</th>
            <th>USDOT #</th>
            <th>MC #</th>
            <th>Driver name</th>
            <th>Driver cell #</th>
            <th>Truck #</th>
            <th>Trailer #</th>
            <th>Current load</th>
            <th>Next load</th>
            <th>Tags</th>
            <th>4×4</th>
            <th className="num">Chains</th>
            <th className="num">Coil racks</th>
            <th>MyCarrierPack PW</th>
            <th>RMIS ID</th>
            <th>RMIS zipcode</th>
            <th>Highway phone #</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => {
            const c = d.carrier_id;
            const carrierName = c && typeof c === 'object' ? c.name : '';
            const mc = c && typeof c === 'object' ? c.mcNumber || '' : '';
            const usdot = c && typeof c === 'object' ? c.usdot || '' : '';
            const mcp = c && typeof c === 'object' ? c.myCarrierPacketPassword || '' : '';
            const rmisId = c && typeof c === 'object' ? c.rmisId || '' : '';
            const rmisZip = c && typeof c === 'object' ? c.rmisZip || '' : '';
            const hw = c && typeof c === 'object' ? c.highwayPhone || '' : '';
            const rowStatus = getDriverBoardRowStatusClass(d);
            return (
              <tr key={d._id} className={rowStatus || undefined}>
                <td>{carrierName || '—'}</td>
                <td className="num">{usdot || '—'}</td>
                <td className="num">{mc || '—'}</td>
                <td>{d.name || '—'}</td>
                <td>{formatPhone(d.phone) || '—'}</td>
                <td>{d.truckNumber || '—'}</td>
                <td>{d.trailerNumber || '—'}</td>
                <td className="current-load-cell">
                  <CurrentLoadCell load={d.currentLoad} onOpenRateConfirmation={handleOpenRateConfirmation} />
                </td>
                <td className="next-load-cell">
                  <CurrentLoadCell load={d.nextLoad} onOpenRateConfirmation={handleOpenRateConfirmation} />
                </td>
                <td className="tags-cell">
                  <DriverTagPills driver={d} />
                </td>
                <td className="four-by-four-cell">{format4x4Column(d)}</td>
                <td className="num">{formatCount(d.chainCount)}</td>
                <td className="num">{formatCount(d.coilRackCount)}</td>
                <td className="plain">{mcp || '—'}</td>
                <td>{rmisId || '—'}</td>
                <td className="num">{rmisZip || '—'}</td>
                <td>{formatPhone(hw) || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rcLoad && (
        <RateConfirmationModal
          loadId={rcLoad._id}
          loadNumber={rcLoad.load_number}
          onClose={() => setRcLoad(null)}
        />
      )}
    </div>
  );
}
