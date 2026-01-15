import React, { useState, useEffect } from 'react';
import { getLoadsGrouped } from '../services/api';
import { formatDate } from '../utils/dateUtils';
import './CalendarPage.css';

// Generate a color for a driver based on their ID
const getDriverColor = (driverId, driverName) => {
  if (!driverId) return '#cccccc'; // Gray for unassigned
  
  // Generate a consistent color based on driver ID
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52BE80',
    '#EC7063', '#5DADE2', '#58D68D', '#F4D03F', '#AF7AC5',
    '#85C1E9', '#F1948A', '#73C6B6', '#F9E79F', '#A569BD'
  ];
  
  // Use driver ID to consistently assign a color
  const hash = driverId.toString().split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);
  
  return colors[hash % colors.length];
};

const CalendarPage = () => {
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [driverColors, setDriverColors] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const groups = await getLoadsGrouped();
      // Flatten groups into a single array of loads
      const allLoads = [];
      groups.forEach(group => {
        if (group.loads && Array.isArray(group.loads)) {
          group.loads.forEach(load => {
            if (!load.cancelled && !load.invoiced) {
              allLoads.push(load);
            }
          });
        }
      });
      
      setLoads(allLoads);
      
      // Build driver color map
      const colorMap = {};
      allLoads.forEach(load => {
        if (load.driver_id) {
          const driverId = typeof load.driver_id === 'object' ? load.driver_id._id : load.driver_id;
          const driverName = typeof load.driver_id === 'object' ? load.driver_id.name : 'Unknown';
          if (!colorMap[driverId]) {
            colorMap[driverId] = getDriverColor(driverId, driverName);
          }
        }
      });
      setDriverColors(colorMap);
    } catch (error) {
      alert('Failed to load loads: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const getLoadsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return loads.filter(load => {
      if (!load.pickup_date || !load.delivery_date) return false;
      
      const pickup = new Date(load.pickup_date);
      const delivery = new Date(load.delivery_date);
      const checkDate = new Date(date);
      
      // Reset time to midnight for comparison
      pickup.setHours(0, 0, 0, 0);
      delivery.setHours(0, 0, 0, 0);
      checkDate.setHours(0, 0, 0, 0);
      
      return checkDate >= pickup && checkDate <= delivery;
    });
  };

  const getLoadSpanInfo = (load, date) => {
    const pickup = new Date(load.pickup_date);
    const delivery = new Date(load.delivery_date);
    const checkDate = new Date(date);
    
    pickup.setHours(0, 0, 0, 0);
    delivery.setHours(0, 0, 0, 0);
    checkDate.setHours(0, 0, 0, 0);
    
    const { year, month } = getDaysInMonth(currentDate);
    const firstDay = new Date(year, month, 1);
    firstDay.setHours(0, 0, 0, 0);
    
    // Calculate which day of the month this is (0-indexed from first day)
    const daysFromStart = Math.floor((checkDate - firstDay) / (1000 * 60 * 60 * 24));
    
    // Calculate load start and end relative to month start
    const loadStart = pickup >= firstDay ? pickup : firstDay;
    const lastDayOfMonth = new Date(year, month + 1, 0);
    lastDayOfMonth.setHours(0, 0, 0, 0);
    const loadEnd = delivery <= lastDayOfMonth ? delivery : lastDayOfMonth;
    
    loadStart.setHours(0, 0, 0, 0);
    loadEnd.setHours(0, 0, 0, 0);
    
    const loadStartDay = Math.floor((loadStart - firstDay) / (1000 * 60 * 60 * 24));
    const loadEndDay = Math.floor((loadEnd - firstDay) / (1000 * 60 * 60 * 24));
    
    const isStart = daysFromStart === loadStartDay;
    const isEnd = daysFromStart === loadEndDay;
    const isInRange = daysFromStart >= loadStartDay && daysFromStart <= loadEndDay;
    
    return { isStart, isEnd, isInRange, loadStartDay, loadEndDay, daysFromStart };
  };

  const navigateMonth = (direction) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  if (loading) {
    return <div className="loading">Loading calendar...</div>;
  }

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const days = [];
  
  // Add empty cells for days before the first day of the month
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }
  
  // Add cells for each day of the month
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(new Date(year, month, day));
  }

  // Get unique drivers for legend
  const drivers = [];
  const driverMap = new Map();
  loads.forEach(load => {
    if (load.driver_id) {
      const driverId = typeof load.driver_id === 'object' ? load.driver_id._id : load.driver_id;
      const driverName = typeof load.driver_id === 'object' ? load.driver_id.name : 'Unknown';
      if (!driverMap.has(driverId)) {
        driverMap.set(driverId, { id: driverId, name: driverName, color: driverColors[driverId] || '#cccccc' });
      }
    }
  });
  drivers.push(...Array.from(driverMap.values()));
  if (loads.some(load => !load.driver_id)) {
    drivers.push({ id: null, name: 'Unassigned', color: '#cccccc' });
  }

  return (
    <div className="calendar-page">
      <div className="calendar-header">
        <h2>Load Calendar</h2>
        <div className="calendar-controls">
          <button onClick={() => navigateMonth(-1)} className="nav-btn">‹ Previous</button>
          <button onClick={goToToday} className="today-btn">Today</button>
          <button onClick={() => navigateMonth(1)} className="nav-btn">Next ›</button>
          <button onClick={loadData} className="refresh-btn">Refresh</button>
        </div>
      </div>

      <div className="calendar-month-header">
        <h3>{monthName}</h3>
      </div>

      <div className="calendar-legend">
        <h4>Drivers:</h4>
        <div className="legend-items">
          {drivers.map(driver => (
            <div key={driver.id || 'unassigned'} className="legend-item">
              <span 
                className="legend-color" 
                style={{ backgroundColor: driver.color }}
              ></span>
              <span className="legend-name">{driver.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="calendar-grid">
        <div className="calendar-weekdays">
          <div className="weekday">Sun</div>
          <div className="weekday">Mon</div>
          <div className="weekday">Tue</div>
          <div className="weekday">Wed</div>
          <div className="weekday">Thu</div>
          <div className="weekday">Fri</div>
          <div className="weekday">Sat</div>
        </div>
        
        <div className="calendar-days">
          {days.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="calendar-day empty"></div>;
            }
            
            const dateLoads = getLoadsForDate(date);
            const isToday = date.toDateString() === new Date().toDateString();
            
            return (
              <div 
                key={date.toISOString()} 
                className={`calendar-day ${isToday ? 'today' : ''}`}
              >
                <div className="day-number">{date.getDate()}</div>
                <div className="day-loads">
                  {dateLoads.map((load, loadIndex) => {
                    const driverId = load.driver_id 
                      ? (typeof load.driver_id === 'object' ? load.driver_id._id : load.driver_id)
                      : null;
                    const driverName = load.driver_id 
                      ? (typeof load.driver_id === 'object' ? load.driver_id.name : 'Unknown')
                      : 'Unassigned';
                    const color = driverId ? driverColors[driverId] : '#cccccc';
                    const spanInfo = getLoadSpanInfo(load, date);
                    
                    if (!spanInfo.isInRange) return null;
                    
                    return (
                      <div
                        key={load._id}
                        className={`load-bar ${spanInfo.isStart ? 'load-start' : ''} ${spanInfo.isEnd ? 'load-end' : ''}`}
                        style={{
                          backgroundColor: color,
                          zIndex: loadIndex
                        }}
                        title={`${load.load_number} - ${driverName}\n${formatDate(load.pickup_date)} to ${formatDate(load.delivery_date)}\n${load.pickup_city}, ${load.pickup_state} → ${load.delivery_city}, ${load.delivery_state}`}
                      >
                        {spanInfo.isStart && (
                          <span className="load-label">
                            {load.load_number}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CalendarPage;
