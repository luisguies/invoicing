const express = require('express');
const router = express.Router();
const { Carrier, Driver } = require('../db/database');

function optionalTrim(v) {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  return String(v).trim();
}

// Get all carriers
router.get('/', async (req, res) => {
  try {
    const carriers = await Carrier.find().populate('driver_ids', 'name aliases');
    res.json(carriers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get carrier by ID
router.get('/:id', async (req, res) => {
  try {
    const carrier = await Carrier.findById(req.params.id).populate('driver_ids', 'name aliases');
    if (!carrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }
    res.json(carrier);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new carrier
router.post('/', async (req, res) => {
  try {
    const {
      name,
      aliases,
      billTo,
      usdot,
      mcNumber,
      myCarrierPacketPassword,
      rmisId,
      rmisZip,
      highwayPhone
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Carrier name is required' });
    }

    const carrier = new Carrier({
      name: name.trim(),
      aliases: aliases || [],
      billTo: billTo || {},
      usdot: optionalTrim(usdot),
      mcNumber: optionalTrim(mcNumber),
      myCarrierPacketPassword: optionalTrim(myCarrierPacketPassword),
      rmisId: optionalTrim(rmisId),
      rmisZip: optionalTrim(rmisZip),
      highwayPhone: optionalTrim(highwayPhone)
    });

    await carrier.save();
    res.status(201).json(carrier);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'Carrier with this name already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Update carrier
router.put('/:id', async (req, res) => {
  try {
    const {
      name,
      aliases,
      driver_ids,
      billTo,
      usdot,
      mcNumber,
      myCarrierPacketPassword,
      rmisId,
      rmisZip,
      highwayPhone
    } = req.body;
    
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (aliases !== undefined) updateData.aliases = aliases;
    if (driver_ids !== undefined) updateData.driver_ids = driver_ids;
    if (billTo !== undefined) updateData.billTo = billTo;
    if (usdot !== undefined) updateData.usdot = optionalTrim(usdot) ?? null;
    if (mcNumber !== undefined) updateData.mcNumber = optionalTrim(mcNumber) ?? null;
    if (myCarrierPacketPassword !== undefined) {
      updateData.myCarrierPacketPassword = optionalTrim(myCarrierPacketPassword) ?? null;
    }
    if (rmisId !== undefined) updateData.rmisId = optionalTrim(rmisId) ?? null;
    if (rmisZip !== undefined) updateData.rmisZip = optionalTrim(rmisZip) ?? null;
    if (highwayPhone !== undefined) updateData.highwayPhone = optionalTrim(highwayPhone) ?? null;

    const carrier = await Carrier.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('driver_ids', 'name aliases');

    if (!carrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    res.json(carrier);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'Carrier with this name already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Delete carrier
router.delete('/:id', async (req, res) => {
  try {
    const carrier = await Carrier.findByIdAndDelete(req.params.id);
    if (!carrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    // Remove carrier reference from drivers
    await Driver.updateMany(
      { carrier_id: req.params.id },
      { $unset: { carrier_id: 1 } }
    );

    res.json({ message: 'Carrier deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

