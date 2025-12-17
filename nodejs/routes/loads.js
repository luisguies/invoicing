const express = require('express');
const router = express.Router();
const { Load } = require('../db/database');
const { checkAndUpdateConflicts, removeFromConflictLists } = require('../services/loadConflictService');
const { createCarrierAlias } = require('../services/carrierResolutionService');

// Get all loads (with optional filters)
router.get('/', async (req, res) => {
  try {
    const { carrier_id, driver_id, cancelled, confirmed } = req.query;
    
    const query = {};
    if (carrier_id) query.carrier_id = carrier_id;
    if (driver_id) query.driver_id = driver_id;
    if (cancelled !== undefined) query.cancelled = cancelled === 'true';
    if (confirmed !== undefined) query.confirmed = confirmed === 'true';

    const loads = await Load.find(query)
      .populate('carrier_id', 'name aliases')
      .populate('driver_id', 'name aliases')
      .populate('date_conflict_ids', 'load_number pickup_date delivery_date')
      .sort({ created_at: -1 });

    res.json(loads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get loads grouped by carrier
router.get('/grouped', async (req, res) => {
  try {
    const { cancelled } = req.query;
    
    const query = { cancelled: false }; // Always exclude cancelled loads from grouped view
    if (cancelled === 'true') {
      // If user wants cancelled, show all
      delete query.cancelled;
    }

    const loads = await Load.find(query)
      .populate('carrier_id', 'name aliases')
      .populate('driver_id', 'name aliases')
      .populate('date_conflict_ids', 'load_number pickup_date delivery_date')
      .sort({ carrier_id: 1, pickup_date: 1 });

    // Group by carrier
    const grouped = {};
    const unassignedLoads = [];
    
    for (const load of loads) {
      if (load.carrier_id) {
        const carrierId = load.carrier_id._id.toString();
        if (!grouped[carrierId]) {
          grouped[carrierId] = {
            carrier: load.carrier_id,
            loads: []
          };
        }
        grouped[carrierId].loads.push(load);
      } else {
        // Loads without carrier go to unassigned group
        unassignedLoads.push(load);
      }
    }

    const result = Object.values(grouped);
    
    // Add unassigned loads group if there are any
    if (unassignedLoads.length > 0) {
      result.push({
        carrier: {
          _id: null,
          name: 'Unassigned Carriers',
          aliases: []
        },
        loads: unassignedLoads
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get load by ID
router.get('/:id', async (req, res) => {
  try {
    const load = await Load.findById(req.params.id)
      .populate('carrier_id', 'name aliases')
      .populate('driver_id', 'name aliases')
      .populate('date_conflict_ids', 'load_number pickup_date delivery_date');
    
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }
    res.json(load);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get conflicting loads for a specific load
router.get('/:id/conflicts', async (req, res) => {
  try {
    const load = await Load.findById(req.params.id)
      .populate('date_conflict_ids', 'load_number pickup_date delivery_date carrier_id driver_id');
    
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }

    const conflicts = await Load.find({ _id: { $in: load.date_conflict_ids } })
      .populate('carrier_id', 'name aliases')
      .populate('driver_id', 'name aliases');

    res.json(conflicts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new load
router.post('/', async (req, res) => {
  try {
    const loadData = req.body;
    
    const load = new Load(loadData);
    await load.save();

    // Check for conflicts
    if (load.pickup_date && load.delivery_date) {
      await checkAndUpdateConflicts(
        load._id,
        load.pickup_date,
        load.delivery_date,
        load.driver_id
      );
    }

    const populatedLoad = await Load.findById(load._id)
      .populate('carrier_id', 'name aliases')
      .populate('driver_id', 'name aliases')
      .populate('date_conflict_ids', 'load_number pickup_date delivery_date');

    res.status(201).json(populatedLoad);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update load
router.put('/:id', async (req, res) => {
  try {
    const load = await Load.findById(req.params.id);
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }

    // Store old dates for conflict re-check
    const oldPickupDate = load.pickup_date;
    const oldDeliveryDate = load.delivery_date;
    const oldDriverId = load.driver_id;

    // Update load
    Object.assign(load, req.body);
    await load.save();

    // Re-check conflicts if dates or driver changed
    if (
      (load.pickup_date && load.pickup_date.getTime() !== oldPickupDate?.getTime()) ||
      (load.delivery_date && load.delivery_date.getTime() !== oldDeliveryDate?.getTime()) ||
      (load.driver_id?.toString() !== oldDriverId?.toString())
    ) {
      if (load.pickup_date && load.delivery_date) {
        await checkAndUpdateConflicts(
          load._id,
          load.pickup_date,
          load.delivery_date,
          load.driver_id
        );
      }
    }

    const populatedLoad = await Load.findById(load._id)
      .populate('carrier_id', 'name aliases')
      .populate('driver_id', 'name aliases')
      .populate('date_conflict_ids', 'load_number pickup_date delivery_date');

    res.json(populatedLoad);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark load as cancelled/uncancelled
router.patch('/:id/cancel', async (req, res) => {
  try {
    const { cancelled } = req.body;
    
    const load = await Load.findById(req.params.id);
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }

    load.cancelled = cancelled !== undefined ? cancelled : !load.cancelled;
    await load.save();

    // If cancelling, remove from other loads' conflict lists
    if (load.cancelled) {
      await removeFromConflictLists(load._id);
      load.date_conflict_ids = [];
      await load.save();
    } else {
      // If uncancelling, re-check conflicts
      if (load.pickup_date && load.delivery_date) {
        await checkAndUpdateConflicts(
          load._id,
          load.pickup_date,
          load.delivery_date,
          load.driver_id
        );
      }
    }

    const populatedLoad = await Load.findById(load._id)
      .populate('carrier_id', 'name aliases')
      .populate('driver_id', 'name aliases')
      .populate('date_conflict_ids', 'load_number pickup_date delivery_date');

    res.json(populatedLoad);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Confirm load (required for loads with conflicts)
router.patch('/:id/confirm', async (req, res) => {
  try {
    const load = await Load.findById(req.params.id);
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }

    load.confirmed = true;
    await load.save();

    const populatedLoad = await Load.findById(load._id)
      .populate('carrier_id', 'name aliases')
      .populate('driver_id', 'name aliases')
      .populate('date_conflict_ids', 'load_number pickup_date delivery_date');

    res.json(populatedLoad);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update load carrier (with optional alias creation)
router.patch('/:id/carrier', async (req, res) => {
  try {
    const { carrier_id, save_alias } = req.body;
    
    if (!carrier_id) {
      return res.status(400).json({ error: 'carrier_id is required' });
    }

    const load = await Load.findById(req.params.id);
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }

    // Update carrier
    load.carrier_id = carrier_id;
    load.carrier_source = 'manual';
    load.needs_review = false;
    load.review_reason = null;

    // If save_alias is true and we have carrier_raw_extracted, create alias
    if (save_alias && load.carrier_raw_extracted) {
      try {
        await createCarrierAlias(load.carrier_raw_extracted, carrier_id);
      } catch (aliasError) {
        console.error('Error creating alias:', aliasError);
        // Don't fail the request if alias creation fails
      }
    }

    await load.save();

    const populatedLoad = await Load.findById(load._id)
      .populate('carrier_id', 'name aliases')
      .populate('driver_id', 'name aliases')
      .populate('date_conflict_ids', 'load_number pickup_date delivery_date');

    res.json(populatedLoad);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete load
router.delete('/:id', async (req, res) => {
  try {
    const load = await Load.findById(req.params.id);
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }

    // Remove from other loads' conflict lists
    await removeFromConflictLists(load._id);

    await Load.findByIdAndDelete(req.params.id);
    res.json({ message: 'Load deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

