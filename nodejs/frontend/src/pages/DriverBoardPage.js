import React, { useEffect, useState } from 'react';
import { getDriversBoard } from '../services/api';
import DriverBoardView from '../driver-board/DriverBoardView';

const DriverBoardPage = () => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getDriversBoard();
        if (!cancelled) setDrivers(data || []);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || err.message || 'Failed to load driver board');
          setDrivers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="driver-board-page">
      <DriverBoardView drivers={drivers} loading={loading} error={error} />
    </div>
  );
};

export default DriverBoardPage;
