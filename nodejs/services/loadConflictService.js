const { Load } = require('../db/database');

/**
 * Check if two date ranges overlap or have the same pickup date
 * @param {Date} pickup1 - First pickup date
 * @param {Date} delivery1 - First delivery date
 * @param {Date} pickup2 - Second pickup date
 * @param {Date} delivery2 - Second delivery date
 * @returns {boolean} True if dates conflict
 */
function datesConflict(pickup1, delivery1, pickup2, delivery2) {
  // Same pickup date
  if (pickup1.getTime() === pickup2.getTime()) {
    return true;
  }

  // Crossing dates: pickup1 is before delivery2 AND delivery1 is after pickup2
  // This means the date ranges overlap
  if (pickup1 < delivery2 && delivery1 > pickup2) {
    return true;
  }

  return false;
}

/**
 * Find loads that conflict with the given load dates
 * @param {ObjectId} loadId - Load ID to check conflicts for
 * @param {Date} pickupDate - Pickup date
 * @param {Date} deliveryDate - Delivery date
 * @param {ObjectId} driverId - Driver ID (optional, checks conflicts for same driver)
 * @returns {Promise<Array>} Array of conflicting load IDs
 */
async function findConflictingLoads(loadId, pickupDate, deliveryDate, driverId = null) {
  const conflictingLoadIds = [];

  // Build query - exclude the current load and cancelled loads
  const query = {
    _id: { $ne: loadId },
    cancelled: false
  };

  // If driver is specified, only check conflicts for the same driver
  if (driverId) {
    query.driver_id = driverId;
  }

  // Get all loads that might conflict (same driver or all loads if no driver)
  const loads = await Load.find(query);

  for (const load of loads) {
    if (datesConflict(
      pickupDate,
      deliveryDate,
      load.pickup_date,
      load.delivery_date
    )) {
      conflictingLoadIds.push(load._id);
    }
  }

  return conflictingLoadIds;
}

/**
 * Update conflict information for a load
 * @param {ObjectId} loadId - Load ID
 * @param {Array<ObjectId>} conflictIds - Array of conflicting load IDs
 * @returns {Promise<Object>} Updated load document
 */
async function updateLoadConflicts(loadId, conflictIds) {
  const load = await Load.findById(loadId);
  if (!load) {
    throw new Error('Load not found');
  }

  load.date_conflict_ids = conflictIds;
  
  // If there are conflicts, set confirmed to false
  if (conflictIds.length > 0) {
    load.confirmed = false;
  }

  await load.save();
  return load;
}

/**
 * Check and update conflicts for a load
 * @param {ObjectId} loadId - Load ID
 * @param {Date} pickupDate - Pickup date
 * @param {Date} deliveryDate - Delivery date
 * @param {ObjectId} driverId - Driver ID (optional)
 * @returns {Promise<Object>} Updated load document with conflict information
 */
async function checkAndUpdateConflicts(loadId, pickupDate, deliveryDate, driverId = null) {
  const conflictIds = await findConflictingLoads(loadId, pickupDate, deliveryDate, driverId);
  const updatedLoad = await updateLoadConflicts(loadId, conflictIds);

  // Also update the conflicting loads to include this load in their conflict list
  for (const conflictId of conflictIds) {
    const conflictLoad = await Load.findById(conflictId);
    if (conflictLoad && !conflictLoad.date_conflict_ids.includes(loadId)) {
      conflictLoad.date_conflict_ids.push(loadId);
      conflictLoad.confirmed = false; // Require re-confirmation
      await conflictLoad.save();
    }
  }

  return updatedLoad;
}

/**
 * Remove a load from other loads' conflict lists when it's deleted or cancelled
 * @param {ObjectId} loadId - Load ID to remove from conflict lists
 */
async function removeFromConflictLists(loadId) {
  await Load.updateMany(
    { date_conflict_ids: loadId },
    { $pull: { date_conflict_ids: loadId } }
  );
}

module.exports = {
  datesConflict,
  findConflictingLoads,
  updateLoadConflicts,
  checkAndUpdateConflicts,
  removeFromConflictLists
};

