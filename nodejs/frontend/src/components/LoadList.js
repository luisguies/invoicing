import React from 'react';
import LoadItem from './LoadItem';
import './LoadList.css';

const LoadList = ({ groups, onLoadUpdate, onLoadDelete }) => {
  if (!groups || groups.length === 0) {
    return <p className="no-loads">No loads found.</p>;
  }

  return (
    <div className="load-list">
      {groups.map((group) => (
        <div key={group.carrier._id || 'unassigned'} className="carrier-group">
          <h3 className="carrier-name">
            {group.carrier.name}
            {group.carrier.aliases && group.carrier.aliases.length > 0 && (
              <span className="aliases"> ({group.carrier.aliases.join(', ')})</span>
            )}
          </h3>
          <table className="loads-table">
            <thead>
              <tr>
                <th>Load #</th>
                <th>Pickup Date</th>
                <th>Delivery Date</th>
                <th>Origin</th>
                <th>Destination</th>
                <th>Amount</th>
                <th>Carrier</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {group.loads.map((load) => (
                <LoadItem
                  key={load._id}
                  load={load}
                  onUpdate={onLoadUpdate}
                  onDelete={onLoadDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

export default LoadList;

