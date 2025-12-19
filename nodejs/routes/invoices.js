const express = require('express');
const router = express.Router();
const { Invoice, Load, InvoiceRule } = require('../db/database');
const { generateInvoicePDF } = require('../services/pdfService');
const fs = require('fs');
const path = require('path');

// Get all invoices
router.get('/', async (req, res) => {
  try {
    const invoices = await Invoice.find()
      .populate('load_ids', 'load_number pickup_date delivery_date carrier_pay')
      .sort({ generated_at: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get invoice by ID
router.get('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('load_ids', 'load_number pickup_date delivery_date carrier_pay carrier_id driver_id')
      .populate('load_ids.carrier_id', 'name aliases')
      .populate('load_ids.driver_id', 'name aliases');
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download invoice PDF
router.get('/:id/pdf', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (!fs.existsSync(invoice.pdf_path)) {
      return res.status(404).json({ error: 'PDF file not found' });
    }

    // Check if this is a view request (no download header) or download request
    const disposition = req.query.download === 'true' 
      ? `attachment; filename="${path.basename(invoice.pdf_path)}"`
      : `inline; filename="${path.basename(invoice.pdf_path)}"`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', disposition);
    
    const fileStream = fs.createReadStream(invoice.pdf_path);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate invoice
router.post('/generate', async (req, res) => {
  try {
    const { load_ids, rule_id, invoiceData, includeUnconfirmed } = req.body;

    let loadIdsToUse = [];

    // If rule_id is provided, use rule to filter loads
    if (rule_id) {
      const rule = await InvoiceRule.findById(rule_id);
      if (!rule) {
        return res.status(404).json({ error: 'Rule not found' });
      }

      const query = {
        cancelled: false // Always exclude cancelled loads
      };

      if (rule.carrier_id) {
        query.carrier_id = rule.carrier_id;
      }

      if (rule.earliest_pickup_date) {
        query.pickup_date = { $gte: rule.earliest_pickup_date };
      }

      if (rule.latest_delivery_date) {
        if (query.pickup_date) {
          query.pickup_date.$lte = rule.latest_delivery_date;
        } else {
          query.delivery_date = { $lte: rule.latest_delivery_date };
        }
      }

      // Only include confirmed loads unless user explicitly allows unconfirmed
      if (!includeUnconfirmed) {
        query.confirmed = true;
      }

      const loads = await Load.find(query).select('_id');
      loadIdsToUse = loads.map(load => load._id);
    } else if (load_ids && Array.isArray(load_ids)) {
      // Use provided load IDs, but filter out cancelled (and optionally unconfirmed)
      const query = {
        _id: { $in: load_ids },
        cancelled: false
      };

      // Only include confirmed loads unless user explicitly allows unconfirmed
      if (!includeUnconfirmed) {
        query.confirmed = true;
      }

      const loads = await Load.find(query).select('_id');
      loadIdsToUse = loads.map(load => load._id);
    } else {
      return res.status(400).json({ error: 'Either load_ids or rule_id must be provided' });
    }

    if (loadIdsToUse.length === 0) {
      return res.status(400).json({ error: 'No valid loads found for invoice generation' });
    }

    // Generate invoice number
    const invoiceNumber = invoiceData?.invoiceNumber || `INV-${Date.now()}`;

    // Generate PDF
    const result = await generateInvoicePDF(loadIdsToUse, {
      ...invoiceData,
      invoiceNumber
    });

    const pdfPath = result.pdfPath;
    const fullInvoiceData = result.invoiceData;

    // Create invoice record with full data snapshot
    const invoice = new Invoice({
      invoice_number: invoiceNumber,
      load_ids: loadIdsToUse,
      pdf_path: pdfPath,
      invoiceDate: fullInvoiceData.invoiceDate,
      dueDate: fullInvoiceData.dueDate,
      billTo: fullInvoiceData.billTo,
      payableTo: fullInvoiceData.payableTo,
      subtotal: fullInvoiceData.subtotal,
      postage: fullInvoiceData.postage,
      total: fullInvoiceData.total,
      balanceDue: fullInvoiceData.balanceDue,
      cta: fullInvoiceData.cta,
      paymentLine: fullInvoiceData.paymentLine,
      groups: fullInvoiceData.groups
    });

    await invoice.save();

    const populatedInvoice = await Invoice.findById(invoice._id)
      .populate('load_ids', 'load_number pickup_date delivery_date carrier_pay');

    res.status(201).json({
      success: true,
      invoice: populatedInvoice,
      message: 'Invoice generated successfully'
    });

  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

