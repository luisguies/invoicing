const express = require('express');
const router = express.Router();
const { Driver, Carrier, Load } = require('../db/database');

const DRIVER_FLEET_FIELDS = [
  'phone',
  'phone2',
  'email',
  'positionDriver',
  'positionOwner',
  'truckType',
  'truckNumber',
  'trailerNumber',
  'tagTarp4ft',
  'tagTarp6ft',
  'tagTarp8ft',
  'tagTwic',
  'tagTanker',
  'tagPipeStakes',
  'hardwood4x4Count',
  'softwood4x4Count',
  'chainCount',
  'coilRackCount',
  'active',
  'needsLoad',
  'notes'
];

const TAG_BOOL_KEYS = ['tagTarp4ft', 'tagTarp6ft', 'tagTarp8ft', 'tagTwic', 'tagTanker', 'tagPipeStakes'];
const COUNT_KEYS = ['hardwood4x4Count', 'softwood4x4Count', 'chainCount', 'coilRackCount'];

function serializeLoadForBoard(load) {
  return {
    _id: load._id,
    load_number: load.load_number,
    rate_confirmation_path: load.rate_confirmation_path || '',
    pickup_city: load.pickup_city,
    pickup_state: load.pickup_state,
    pickup_date: load.pickup_date,
    delivery_city: load.delivery_city,
    delivery_state: load.delivery_state,
    delivery_date: load.delivery_date
  };
}

function pickCurrentLoad(loads) {
  if (!loads || !loads.length) return null;
  const now = new Date();
  const inProgress = loads.filter(
    (l) =>
      l.pickup_date &&
      l.delivery_date &&
      new Date(l.pickup_date) <= now &&
      new Date(l.delivery_date) >= now
  );
  inProgress.sort((a, b) => new Date(a.pickup_date) - new Date(b.pickup_date));
  if (inProgress.length) return serializeLoadForBoard(inProgress[0]);
  const upcoming = loads.filter((l) => l.pickup_date && new Date(l.pickup_date) > now);
  upcoming.sort((a, b) => new Date(a.pickup_date) - new Date(b.pickup_date));
  if (upcoming.length) return serializeLoadForBoard(upcoming[0]);
  return null;
}

/** Earliest load with pickup strictly after now. If that load is the same as currentLoad (e.g. current column shows the next upcoming), use the second-earliest future pickup. */
function pickNextUpcomingLoad(loads, currentLoad) {
  if (!loads || !loads.length) return null;
  const now = new Date();
  const upcoming = loads
    .filter((l) => l.pickup_date && new Date(l.pickup_date) > now)
    .sort((a, b) => new Date(a.pickup_date) - new Date(b.pickup_date));
  if (!upcoming.length) return null;

  const currentId =
    currentLoad && currentLoad._id != null ? String(currentLoad._id) : null;
  let takeIndex = 0;
  if (currentId && upcoming[0] && String(upcoming[0]._id) === currentId) {
    takeIndex = 1;
  }
  if (takeIndex >= upcoming.length) return null;
  return serializeLoadForBoard(upcoming[takeIndex]);
}

function applyFleetFields(target, body) {
  for (const key of DRIVER_FLEET_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    if (key === 'active') {
      const v = body[key];
      target.active = v === true || v === 'true';
      if (v === false || v === 'false') target.active = false;
    } else if (key === 'positionDriver' || key === 'positionOwner' || TAG_BOOL_KEYS.includes(key)) {
      const v = body[key];
      target[key] = v === true || v === 'true';
      if (v === false || v === 'false') target[key] = false;
    } else if (COUNT_KEYS.includes(key)) {
      const v = body[key];
      if (v === '' || v === undefined || v === null) {
        target[key] = null;
      } else {
        const n = parseInt(String(v), 10);
        target[key] = Number.isFinite(n) && n >= 0 ? n : null;
      }
    } else {
      const v = body[key];
      target[key] = v === undefined || v === null || v === '' ? undefined : String(v).trim();
    }
  }
}

// Board: all drivers with carrier info + current load from main Load collection; sorted by carrier name
router.get('/board', async (req, res) => {
  try {
    const drivers = await Driver.find({ active: { $ne: false } })
      .populate(
        'carrier_id',
        'name aliases usdot mcNumber billTo myCarrierPacketPassword rmisId rmisZip highwayPhone'
      )
      .lean();

    drivers.sort((a, b) => {
      const carrierA = (a.carrier_id?.name || '').toLowerCase();
      const carrierB = (b.carrier_id?.name || '').toLowerCase();
      if (carrierA !== carrierB) return carrierA.localeCompare(carrierB);
      return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
    });

    const driverIds = drivers.map((d) => d._id);
    if (driverIds.length === 0) {
      return res.json([]);
    }

    const loads = await Load.find({
      driver_id: { $in: driverIds },
      cancelled: { $ne: true }
    }).lean();

    const byDriver = new Map();
    for (const load of loads) {
      const id = String(load.driver_id);
      if (!byDriver.has(id)) byDriver.set(id, []);
      byDriver.get(id).push(load);
    }

    for (const d of drivers) {
      const mine = byDriver.get(String(d._id)) || [];
      const currentLoad = pickCurrentLoad(mine);
      d.currentLoad = currentLoad;
      d.nextLoad = pickNextUpcomingLoad(mine, currentLoad);
    }

    res.json(drivers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all drivers (optionally filtered by carrier)
router.get('/', async (req, res) => {
  try {
    const { carrier_id } = req.query;

    const query = {};
    if (carrier_id) {
      query.carrier_id = carrier_id;
      // Selection UIs (loads list, create load) only list active drivers; inactive stay assignable via history.
      query.active = { $ne: false };
    }

    const drivers = await Driver.find(query)
      .populate(
        'carrier_id',
        'name aliases usdot mcNumber billTo myCarrierPacketPassword rmisId rmisZip highwayPhone'
      )
      .sort({ name: 1 });
    res.json(drivers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get driver by ID
router.get('/:id', async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id).populate(
      'carrier_id',
      'name aliases usdot mcNumber billTo myCarrierPacketPassword rmisId rmisZip highwayPhone'
    );
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    res.json(driver);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new driver
router.post('/', async (req, res) => {
  try {
    const { name, aliases, carrier_id, groupLabel, color } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Driver name is required' });
    }

    if (!carrier_id) {
      return res.status(400).json({ error: 'Carrier ID is required' });
    }

    // Verify carrier exists
    const carrier = await Carrier.findById(carrier_id);
    if (!carrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    const driver = new Driver({
      name: name.trim(),
      aliases: aliases || [],
      carrier_id: carrier_id,
      groupLabel: groupLabel ? groupLabel.trim() : undefined,
      color: color ? color.trim() : undefined
    });
    applyFleetFields(driver, req.body);

    await driver.save();

    // Add driver to carrier's driver_ids array
    await Carrier.findByIdAndUpdate(carrier_id, {
      $addToSet: { driver_ids: driver._id }
    });

    const populatedDriver = await Driver.findById(driver._id).populate(
      'carrier_id',
      'name aliases usdot mcNumber billTo myCarrierPacketPassword rmisId rmisZip highwayPhone'
    );
    res.status(201).json(populatedDriver);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update driver
router.put('/:id', async (req, res) => {
  try {
    const { name, aliases, carrier_id, groupLabel, color } = req.body;
    
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (aliases !== undefined) updateData.aliases = aliases;
    if (groupLabel !== undefined) updateData.groupLabel = groupLabel ? groupLabel.trim() : undefined;
    if (color !== undefined) updateData.color = color ? color.trim() : null;
    
    applyFleetFields(updateData, req.body);

    if (carrier_id !== undefined) {
      // Verify new carrier exists
      const carrier = await Carrier.findById(carrier_id);
      if (!carrier) {
        return res.status(404).json({ error: 'Carrier not found' });
      }

      // Remove driver from old carrier's driver_ids
      if (driver.carrier_id) {
        await Carrier.findByIdAndUpdate(driver.carrier_id, {
          $pull: { driver_ids: driver._id }
        });
      }

      // Add driver to new carrier's driver_ids
      updateData.carrier_id = carrier_id;
      await Carrier.findByIdAndUpdate(carrier_id, {
        $addToSet: { driver_ids: driver._id }
      });
    }

    const updatedDriver = await Driver.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate(
      'carrier_id',
      'name aliases usdot mcNumber billTo myCarrierPacketPassword rmisId rmisZip highwayPhone'
    );

    res.json(updatedDriver);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete driver
router.delete('/:id', async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    // Remove driver from carrier's driver_ids array
    if (driver.carrier_id) {
      await Carrier.findByIdAndUpdate(driver.carrier_id, {
        $pull: { driver_ids: driver._id }
      });
    }

    await Driver.findByIdAndDelete(req.params.id);
    res.json({ message: 'Driver deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

