const express = require('express');
const router = express.Router();
const { Settings } = require('../db/database');

// Get settings (or create default if none exists)
router.get('/', async (req, res) => {
  try {
    let settings = await Settings.findOne();
    
    if (!settings) {
      // Create default settings
      settings = new Settings({
        defaultRate: 5.0,
        billTo: {
          name: '',
          cityStateZip: '',
          phone: ''
        }
      });
      await settings.save();
    }
    
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings
router.put('/', async (req, res) => {
  try {
    const { defaultRate, billTo } = req.body;
    
    let settings = await Settings.findOne();
    
    if (!settings) {
      settings = new Settings({
        defaultRate: defaultRate || 5.0,
        billTo: billTo || {}
      });
    } else {
      if (defaultRate !== undefined) {
        settings.defaultRate = defaultRate;
      }
      if (billTo !== undefined) {
        settings.billTo = billTo;
      }
    }
    
    await settings.save();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

