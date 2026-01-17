import React, { useState, useEffect } from 'react';
import { getLoadsGrouped, getDrivers } from '../services/api';
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
      // Load drivers and loads in parallel
      const [groups, drivers] = await Promise.all([getLoadsGrouped(), getDrivers()]);
      
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
      
      // Build driver color map - use stored colors from drivers, fallback to auto-generated
      const colorMap = {};
      const driverColorMap = {};
      
      // Create a map of driver IDs to their stored colors
      drivers.forEach(driver => {
        if (driver._id && driver.color) {
          driverColorMap[driver._id] = driver.color;
        }
      });
      
      // Build color map for all drivers in loads
      allLoads.forEach(load => {
        if (load.driver_id) {
          const driverId = typeof load.driver_id === 'object' ? load.driver_id._id : load.driver_id;
          const driverName = typeof load.driver_id === 'object' ? load.driver_id.name : 'Unknown';
          if (!colorMap[driverId]) {
            // Use stored color if available, otherwise generate one
            colorMap[driverId] = driverColorMap[driverId] || getDriverColor(driverId, driverName);
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

  const getLoadSpanInfo = (load) => {
    const pickup = new Date(load.pickup_date);
    const delivery = new Date(load.delivery_date);
    
    pickup.setHours(0, 0, 0, 0);
    delivery.setHours(0, 0, 0, 0);
    
    const { year, month, startingDayOfWeek } = getDaysInMonth(currentDate);
    const firstDay = new Date(year, month, 1);
    firstDay.setHours(0, 0, 0, 0);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    lastDayOfMonth.setHours(0, 0, 0, 0);
    
    // Calculate load start and end relative to month start
    const loadStart = pickup >= firstDay ? pickup : firstDay;
    const loadEnd = delivery <= lastDayOfMonth ? delivery : lastDayOfMonth;
    
    loadStart.setHours(0, 0, 0, 0);
    loadEnd.setHours(0, 0, 0, 0);
    
    // Calculate which day of the calendar grid (including empty cells at start)
    const loadStartDay = Math.floor((loadStart - firstDay) / (1000 * 60 * 60 * 24));
    const loadEndDay = Math.floor((loadEnd - firstDay) / (1000 * 60 * 60 * 24));
    
    // Calculate grid position (including empty cells)
    const gridStart = startingDayOfWeek + loadStartDay;
    const gridEnd = startingDayOfWeek + loadEndDay;
    const spanDays = gridEnd - gridStart + 1;
    
    // Check if pickup/delivery are within the visible month
    const pickupInMonth = pickup >= firstDay && pickup <= lastDayOfMonth;
    const deliveryInMonth = delivery >= firstDay && delivery <= lastDayOfMonth;
    const pickupBeforeMonth = pickup < firstDay;
    const deliveryAfterMonth = delivery > lastDayOfMonth;
    
    return { 
      gridStart, 
      gridEnd, 
      spanDays, 
      loadStartDay, 
      loadEndDay,
      isVisible: loadEnd >= firstDay && loadStart <= lastDayOfMonth,
      loadStartDate: loadStart,
      loadEndDate: loadEnd,
      pickupDate: pickup,
      deliveryDate: delivery,
      pickupInMonth,
      deliveryInMonth,
      pickupBeforeMonth,
      deliveryAfterMonth
    };
  };
  
  // Get load segment info for a specific day
  const getLoadSegmentForDay = (load, date, spanInfo) => {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    
    const isPickupDay = checkDate.getTime() === spanInfo.pickupDate.getTime() && spanInfo.pickupInMonth;
    const isDeliveryDay = checkDate.getTime() === spanInfo.deliveryDate.getTime() && spanInfo.deliveryInMonth;
    const isInRange = checkDate >= spanInfo.loadStartDate && checkDate <= spanInfo.loadEndDate;
    
    if (!isInRange) return null;
    
    // Calculate which day of the month this is
    const { year, month } = getDaysInMonth(currentDate);
    const firstDay = new Date(year, month, 1);
    firstDay.setHours(0, 0, 0, 0);
    const dayIndex = Math.floor((checkDate - firstDay) / (1000 * 60 * 60 * 24));
    const { startingDayOfWeek } = getDaysInMonth(currentDate);
    const gridPosition = startingDayOfWeek + dayIndex;
    const column = gridPosition % 7;
    const weekRow = Math.floor(gridPosition / 7);
    
    // Determine left position and width for this day
    let leftPercent, widthPercent;
    
    // Check if this is the first day of the visible range (pickup before month)
    const isFirstVisibleDay = checkDate.getTime() === spanInfo.loadStartDate.getTime() && spanInfo.pickupBeforeMonth;
    // Check if this is the last day of the visible range (delivery after month)
    const isLastVisibleDay = checkDate.getTime() === spanInfo.loadEndDate.getTime() && spanInfo.deliveryAfterMonth;
    
    if (isPickupDay && isDeliveryDay) {
      // Same day pickup and delivery - show full width
      leftPercent = (column / 7) * 100;
      widthPercent = (1 / 7) * 100;
    } else if (isPickupDay) {
      // Pickup day - start from right side (50% of day)
      leftPercent = (column / 7) * 100 + (1 / 7) * 50;
      widthPercent = (1 / 7) * 50;
    } else if (isDeliveryDay) {
      // Delivery day - end at left side (50% of day)
      leftPercent = (column / 7) * 100;
      widthPercent = (1 / 7) * 50;
    } else if (isFirstVisibleDay) {
      // First visible day but pickup was before month - show from left (full width, already in transit)
      leftPercent = (column / 7) * 100;
      widthPercent = (1 / 7) * 100;
    } else if (isLastVisibleDay) {
      // Last visible day but delivery is after month - show to right (full width, still in transit)
      leftPercent = (column / 7) * 100;
      widthPercent = (1 / 7) * 100;
    } else {
      // Day in between - full width
      leftPercent = (column / 7) * 100;
      widthPercent = (1 / 7) * 100;
    }
    
    return {
      leftPercent,
      widthPercent,
      weekRow,
      column,
      isPickupDay,
      isDeliveryDay
    };
  };

  // Assign lanes to loads to prevent overlapping
  const assignLoadLanes = (visibleLoads) => {
    const lanes = [];
    const loadLaneMap = new Map();
    
    // Sort loads by start date, then by end date
    const sortedLoads = [...visibleLoads].sort((a, b) => {
      const aInfo = getLoadSpanInfo(a);
      const bInfo = getLoadSpanInfo(b);
      if (aInfo.loadStartDate.getTime() !== bInfo.loadStartDate.getTime()) {
        return aInfo.loadStartDate - bInfo.loadStartDate;
      }
      return aInfo.loadEndDate - bInfo.loadEndDate;
    });
    
    // For each load, find the first lane where it doesn't overlap with existing loads
    sortedLoads.forEach(load => {
      const loadInfo = getLoadSpanInfo(load);
      
      // Find a lane where this load doesn't overlap
      let assignedLane = -1;
      for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
        const laneLoads = lanes[laneIndex];
        // Check if this load overlaps with any load in this lane
        const hasOverlap = laneLoads.some(existingLoad => {
          const existingInfo = getLoadSpanInfo(existingLoad);
          // Two loads overlap if: loadStart <= existingEnd && loadEnd >= existingStart
          return loadInfo.loadStartDate <= existingInfo.loadEndDate &&
                 loadInfo.loadEndDate >= existingInfo.loadStartDate;
        });
        
        if (!hasOverlap) {
          assignedLane = laneIndex;
          break;
        }
      }
      
      // If no lane found, create a new one
      if (assignedLane === -1) {
        assignedLane = lanes.length;
        lanes.push([]);
      }
      
      // Assign load to lane
      lanes[assignedLane].push(load);
      loadLaneMap.set(load._id, assignedLane);
    });
    
    return loadLaneMap;
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
  
  // Calculate max lanes needed for all visible loads
  const visibleLoads = loads.filter(load => {
    if (!load.pickup_date || !load.delivery_date) return false;
    const spanInfo = getLoadSpanInfo(load);
    return spanInfo.isVisible;
  });
  const loadLaneMap = assignLoadLanes(visibleLoads);
  const laneValues = Array.from(loadLaneMap.values());
  const maxLanes = laneValues.length > 0 ? Math.max(...laneValues) + 1 : 0;
  const baseDayHeight = 120;
  const laneHeight = 22; // Height per lane (20px bar + 2px spacing)
  const dynamicDayHeight = baseDayHeight + (maxLanes * laneHeight);

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
            
            const isToday = date.toDateString() === new Date().toDateString();
            
            return (
              <div 
                key={date.toISOString()} 
                className={`calendar-day ${isToday ? 'today' : ''}`}
                style={{ minHeight: `${dynamicDayHeight}px` }}
              >
                <div className="day-number">{date.getDate()}</div>
                <div className="day-loads">
                  <div className="day-divider"></div>
                </div>
              </div>
            );
          })}
          
          {/* Render load bars as continuous bars with pickup/delivery day masks */}
          {visibleLoads.map((load) => {
            const driverId = load.driver_id 
              ? (typeof load.driver_id === 'object' ? load.driver_id._id : load.driver_id)
              : null;
            const driverName = load.driver_id 
              ? (typeof load.driver_id === 'object' ? load.driver_id.name : 'Unknown')
              : 'Unassigned';
            const color = driverId ? driverColors[driverId] : '#cccccc';
            const spanInfo = getLoadSpanInfo(load);
            
            if (!spanInfo.isVisible) return null;
            
            // Get the lane assignment for this load
            const lane = loadLaneMap.get(load._id) || 0;
            const dayNumberHeight = 25;
            const loadBarHeight = 20;
            const topOffset = 5;
            const laneSpacing = loadBarHeight + 2;
            
            // Calculate the start column and week row
            const startColumn = spanInfo.gridStart % 7;
            const startWeekRow = Math.floor(spanInfo.gridStart / 7);
            
            // Calculate base left position and width for continuous bar
            const leftPercent = (startColumn / 7) * 100;
            const widthPercent = (spanInfo.spanDays / 7) * 100;
            
            // Calculate top position
            const topPx = (startWeekRow * dynamicDayHeight) + dayNumberHeight + topOffset + (lane * laneSpacing);
            
            // Determine if we need masks for pickup/delivery days
            const needsPickupMask = spanInfo.pickupInMonth && 
              spanInfo.pickupDate.getTime() === spanInfo.loadStartDate.getTime() &&
              spanInfo.pickupDate.getTime() !== spanInfo.deliveryDate.getTime();
            
            const needsDeliveryMask = spanInfo.deliveryInMonth && 
              spanInfo.deliveryDate.getTime() === spanInfo.loadEndDate.getTime() &&
              spanInfo.pickupDate.getTime() !== spanInfo.deliveryDate.getTime();
            
            // Calculate clip-path for pickup/delivery restrictions
            // Clip-path coordinates are relative to the bar element itself (0-100% of bar width)
            let clipPath = null;
            
            // Handle same-day pickup and delivery
            const isSameDay = spanInfo.pickupInMonth && spanInfo.deliveryInMonth && 
              spanInfo.pickupDate.getTime() === spanInfo.deliveryDate.getTime();
            
            if (!isSameDay && (needsPickupMask || needsDeliveryMask)) {
              const totalDays = spanInfo.spanDays;
              
              // Calculate what portion of the bar each day represents
              const dayPortionPercent = 100 / totalDays; // Each day is this % of total bar width
              
              // Calculate start and end X positions
              let startX = 0;
              let endX = 100;
              
              if (needsPickupMask) {
                // Start from right 50% of first day
                startX = 0.5 * dayPortionPercent;
              }
              
              if (needsDeliveryMask) {
                // End at left 50% of last day
                endX = 100 - (0.5 * dayPortionPercent);
              }
              
              // Create a rectangle polygon: top-left, top-right, bottom-right, bottom-left
              clipPath = `polygon(${startX}% 0%, ${endX}% 0%, ${endX}% 100%, ${startX}% 100%)`;
            }
            
            return (
              <div
                key={load._id}
                className="load-bar-spanning"
                style={{
                  position: 'absolute',
                  left: `${leftPercent}%`,
                  width: `${widthPercent}%`,
                  top: `${topPx}px`,
                  backgroundColor: color,
                  zIndex: 1 + lane,
                  clipPath: clipPath || 'none'
                }}
                title={`${load.load_number} - ${driverName}\n${formatDate(load.pickup_date)} to ${formatDate(load.delivery_date)}\n${load.pickup_city}, ${load.pickup_state} → ${load.delivery_city}, ${load.delivery_state}`}
              >
                <span className="load-label">
                  {load.load_number}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CalendarPage;
