const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Invoice, Load, InvoiceRule } = require('../db/database');
const { generateInvoicePDF, formatDate } = require('../services/pdfService');
const { computeInvoiceWeekFields } = require('../services/invoiceWeekService');
const { resolveCarrier } = require('../services/carrierResolutionService');
const { findOrCreateDriver } = require('../services/carrierDriverService');
const { extractOldInvoice: extractOldInvoiceFromPython } = require('../services/ocrService');
const { parseOldLoadsWorkbook } = require('../services/xlsxImportService');
const { applyTonuLocationRules } = require('../services/loadPayService');
const fs = require('fs');
const path = require('path');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EPSILON = 0.0001;

function toCurrency(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function parseOldInvoiceFilename(filename) {
  const baseName = basenameFromAnyOs(filename) || path.basename(filename);
  const withoutExt = baseName.replace(/\.[^.]+$/i, '');
  const idx = withoutExt.toLowerCase().lastIndexOf(' invoice ');
  if (idx === -1) return null;
  const carrierName = withoutExt.slice(0, idx).trim();
  if (!carrierName) return null;
  const suffix = withoutExt.slice(idx + ' invoice '.length).trim();
  const date = parseFlexibleInvoiceSuffixDate(suffix);
  if (!date) return null;
  return {
    carrierName,
    dateStr: date.toISOString().slice(0, 10),
    date
  };
}

const oldInvoicesDir = process.env.OLD_INVOICES_DIR || path.join(process.cwd(), 'uploads', 'old-invoices');
if (!fs.existsSync(oldInvoicesDir)) {
  fs.mkdirSync(oldInvoicesDir, { recursive: true });
}
const oldInvoiceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, oldInvoicesDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, unique);
  }
});
const uploadOldInvoice = multer({
  storage: oldInvoiceStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: { fileSize: 15 * 1024 * 1024 }
});

const uploadOldLoadsWorkbook = multer({
  storage: oldInvoiceStorage,
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      name.endsWith('.xlsx')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx files are allowed'), false);
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }
});

/**
 * Compute date range for the "default" rule (UTC):
 * - earliest_pickup_date: previous Saturday (the Saturday before the most recent one)
 * - latest_delivery_date: current Monday (the Monday of the week containing today)
 * Example: today Tue 2026-02-03 → previous Saturday 2026-01-24, current Monday 2026-02-02
 */
function getDefaultRuleDatesUtc() {
  const now = new Date();
  const day = now.getUTCDay(); // 0 Sun, 1 Mon, ..., 6 Sat

  // Current Monday (start of week containing today)
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const currentMonday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday,
    0, 0, 0, 0
  ));

  // Previous Saturday = last Saturday - 7 days
  const daysToLastSaturday = (day - 6 + 7) % 7;
  const lastSaturday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysToLastSaturday,
    0, 0, 0, 0
  ));
  const previousSaturday = new Date(lastSaturday.getTime() - 7 * MS_PER_DAY);

  return { earliest_pickup_date: previousSaturday, latest_delivery_date: currentMonday };
}

function parseInvoiceWeekIdToUtcMonday(invoiceWeekId) {
  if (!invoiceWeekId) return null;
  const d = new Date(`${invoiceWeekId}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Pickup/delivery/invoice dates from XLSX: YYYY-MM-DD (optional time from Excel),
 * DD-MM-YYYY / DD-MM-YY, or M/D/YYYY (US-style slash).
 */
function parseWorkbookDate(value) {
  const raw = (value || '').toString().trim();
  if (!raw) return null;

  const isoHead = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s|T|$)/);
  if (isoHead) {
    const d = parseInvoiceDateYmdParts(Number(isoHead[1]), Number(isoHead[2]), Number(isoHead[3]));
    if (d) return d;
  }

  const dmy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dmy) {
    return parseInvoiceDateDmyParts(Number(dmy[1]), Number(dmy[2]), Number(dmy[3]));
  }

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function firstTrimmedFieldInRows(rows, keys) {
  for (const row of rows) {
    for (const key of keys) {
      if (!key || !(key in row)) continue;
      const s = (row[key] != null ? String(row[key]) : '').trim();
      if (s) return s;
    }
  }
  return '';
}

/** Normalize Windows paths so path parsing works on Linux (Node 'path' only treats / as separator on POSIX). */
function pathSegmentsFromSourcePdf(sourcePdf) {
  const normalized = (sourcePdf || '').toString().trim().replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean);
}

function basenameFromAnyOs(sourcePdf) {
  const segs = pathSegmentsFromSourcePdf(sourcePdf);
  return segs.length ? segs[segs.length - 1] : '';
}

function parentDirFromAnyOs(sourcePdf) {
  const segs = pathSegmentsFromSourcePdf(sourcePdf);
  return segs.length >= 2 ? segs[segs.length - 2] : '';
}

function parseInvoiceDateDmyParts(day, month, year) {
  if (year < 100) year += 2000;
  if (day <= 12 && month > 12) {
    const tmp = day;
    day = month;
    month = tmp;
  }
  const invoiceDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  return Number.isNaN(invoiceDate.getTime()) ? null : invoiceDate;
}

/** YYYY-MM-DD */
function parseInvoiceDateYmdParts(year, month, day) {
  const invoiceDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  return Number.isNaN(invoiceDate.getTime()) ? null : invoiceDate;
}

/**
 * A single dashed date segment: YYYY-MM-DD, DD-MM-YYYY, or DD-MM-YY (latter uses day/month swap when ambiguous).
 */
function parseFlexibleDashDateSegment(trimmed) {
  if (!trimmed) return null;
  const t = trimmed.trim();
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return parseInvoiceDateYmdParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const dmy = t.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dmy) {
    return parseInvoiceDateDmyParts(Number(dmy[1]), Number(dmy[2]), Number(dmy[3]));
  }
  return null;
}

/** Suffix after " Invoice " may be "YYYY-MM-DD", "DD-MM-YYYY", "DD-MM-YY", optional extra text after space. */
function parseFlexibleInvoiceSuffixDate(suffix) {
  if (!suffix) return null;
  const t = suffix.trim();
  let d = parseFlexibleDashDateSegment(t);
  if (d) return d;
  const first = t.split(/\s+/)[0];
  return parseFlexibleDashDateSegment(first);
}

function parseSourcePdfInfo(sourcePdf) {
  const basename = basenameFromAnyOs(sourcePdf);
  if (!basename) return null;
  const parentFolder = parentDirFromAnyOs(sourcePdf);
  const withoutExt = basename.replace(/\.[^.]+$/, '');

  const invoiceWordIndex = withoutExt.toLowerCase().lastIndexOf(' invoice ');
  if (invoiceWordIndex !== -1) {
    const carrierName = withoutExt.slice(0, invoiceWordIndex).trim();
    const suffix = withoutExt.slice(invoiceWordIndex + ' invoice '.length).trim();
    const invoiceDate = parseFlexibleInvoiceSuffixDate(suffix);
    return {
      basename,
      carrierName,
      invoiceDate
    };
  }

  const ymdEnd = withoutExt.match(/^(.+?)\s+(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymdEnd) {
    const carrierName = ymdEnd[1].trim();
    const invoiceDate = parseInvoiceDateYmdParts(Number(ymdEnd[2]), Number(ymdEnd[3]), Number(ymdEnd[4]));
    return {
      basename,
      carrierName,
      invoiceDate
    };
  }

  const dashEnd = withoutExt.match(/^(.+?)\s+(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dashEnd) {
    const carrierName = dashEnd[1].trim();
    const invoiceDate = parseInvoiceDateDmyParts(
      Number(dashEnd[2]),
      Number(dashEnd[3]),
      Number(dashEnd[4])
    );
    return {
      basename,
      carrierName,
      invoiceDate
    };
  }

  if (parentFolder && !/^\d{4}$/.test(parentFolder)) {
    return {
      basename,
      carrierName: parentFolder.trim(),
      invoiceDate: null
    };
  }

  return null;
}

function splitCityState(value, fallbackCity = '', fallbackState = '') {
  const raw = (value || '').toString().trim();
  if (!raw) {
    return { city: fallbackCity, state: fallbackState };
  }
  const idx = raw.lastIndexOf(',');
  if (idx === -1) {
    return { city: raw, state: fallbackState };
  }
  return {
    city: raw.slice(0, idx).trim(),
    state: raw.slice(idx + 1).trim().toUpperCase() || fallbackState
  };
}

function randomSixDigits() {
  return String(Math.floor(Math.random() * 900000) + 100000);
}

function parseCurrencyInput(value) {
  const raw = (value || '').toString().replace(/[$,]/g, '').trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Get all invoices (optional query: carrier, dateFrom, dateTo)
router.get('/', async (req, res) => {
  try {
    const { carrier, dateFrom, dateTo } = req.query;
    const conditions = [];

    if (carrier && String(carrier).trim()) {
      const carrierRegex = new RegExp(escapeRegex(String(carrier).trim()), 'i');
      conditions.push({
        $or: [
          { carrier_name: carrierRegex },
          { 'billTo.name': carrierRegex }
        ]
      });
    }

    if (dateFrom || dateTo) {
      const dateCond = {};
      if (dateFrom) {
        const d = new Date(dateFrom);
        if (!Number.isNaN(d.getTime())) dateCond.$gte = d;
      }
      if (dateTo) {
        const d = new Date(dateTo);
        d.setUTCHours(23, 59, 59, 999);
        if (!Number.isNaN(d.getTime())) dateCond.$lte = d;
      }
      if (Object.keys(dateCond).length > 0) {
        conditions.push({
          $or: [
            { invoiceDate: dateCond },
            { invoiceDate: null, generated_at: dateCond }
          ]
        });
      }
    }

    const findQuery = conditions.length > 0 ? { $and: conditions } : {};

    const invoices = await Invoice.find(findQuery)
      .populate('load_ids', 'load_number pickup_date delivery_date carrier_pay carrier_id invoice_monday invoice_week_id')
      .populate('load_ids.carrier_id', 'name aliases')
      .sort({ generated_at: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Upload old invoice PDF (filename: "{Carrier Name} Invoice YYYY-MM-DD.pdf")
router.post('/upload-old', uploadOldInvoice.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const filename = req.file.originalname || path.basename(req.file.path);
    const parsed = parseOldInvoiceFilename(filename);
    if (!parsed) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: 'Filename must match: "{Carrier Name} Invoice YYYY-MM-DD.pdf"'
      });
    }
    const invoiceNumber = `OLD-${parsed.dateStr}-${Date.now()}`;
    const invoice = new Invoice({
      invoice_number: invoiceNumber,
      load_ids: [],
      pdf_path: req.file.path,
      invoiceDate: parsed.date,
      carrier_name: parsed.carrierName,
      billTo: { name: parsed.carrierName }
    });
    await invoice.save();
    const populated = await Invoice.findById(invoice._id)
      .populate('load_ids', 'load_number pickup_date delivery_date carrier_pay carrier_id invoice_monday invoice_week_id')
      .populate('load_ids.carrier_id', 'name aliases');
    res.status(201).json({
      success: true,
      invoice: populated,
      parsed: { carrierName: parsed.carrierName, date: parsed.dateStr }
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    res.status(500).json({ error: error.message });
  }
});

// Extract structured data from old invoice PDF (text extraction; driver sections + load lines)
router.post('/extract-old-invoice', uploadOldInvoice.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const data = await extractOldInvoiceFromPython(req.file.path);
    res.json({ success: true, data });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    res.status(500).json({ error: error.message });
  }
});

// Save extracted (and possibly edited) old invoice: create Loads + Invoice
router.post('/save-extracted', uploadOldInvoice.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const dataRaw = req.body.data;
    if (!dataRaw) {
      return res.status(400).json({ error: 'Missing body field: data (JSON string of extracted invoice)' });
    }
    let data;
    try {
      data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON in data field' });
    }
    const carrierName = (data.carrierName || data.billTo?.name || '').trim();
    if (!carrierName) {
      return res.status(400).json({ error: 'Carrier name is required' });
    }
    const resolution = await resolveCarrier(carrierName);
    const carrier_id = resolution ? resolution.carrier_id : null;
    if (!carrier_id) {
      return res.status(400).json({
        error: `Carrier "${carrierName}" not found. Add the carrier in Settings first or use an existing alias.`
      });
    }
    const groups = Array.isArray(data.groups) ? data.groups : [];
    const loadIds = [];
    for (const group of groups) {
      const driverName = (group.groupLabel || '').trim();
      const driver = driverName ? await findOrCreateDriver(driverName, carrier_id) : null;
      const driver_id = driver ? driver._id : null;
      const lines = Array.isArray(group.lines) ? group.lines : [];
      for (const line of lines) {
        const pickupStr = line.pickupDate || '';
        const deliveryStr = line.deliveryDate || '';
        const price = parseFloat(String(line.price || '0').replace(/,/g, '')) || 0;
        const pickupDate = pickupStr ? new Date(pickupStr) : null;
        const deliveryDate = deliveryStr ? new Date(deliveryStr) : null;
        if (!pickupDate || Number.isNaN(pickupDate.getTime()) || !deliveryDate || Number.isNaN(deliveryDate.getTime())) {
          continue;
        }
        const invoiceWeek = computeInvoiceWeekFields(pickupDate, deliveryDate);
        const invoiceMonday = invoiceWeek ? invoiceWeek.invoiceMonday : null;
        const invoiceWeekId = invoiceWeek ? invoiceWeek.invoiceWeekId : null;
        const loadNumber = `LOAD-${pickupStr.replace(/\//g, '-')}-${price}`;
        const originParts = (line.originCityState || '').split(',').map(s => s.trim());
        const destParts = (line.destCityState || '').split(',').map(s => s.trim());
        const pickup_city = originParts[0] || '';
        const pickup_state = originParts[1] || '';
        const delivery_city = destParts[0] || '';
        const delivery_state = destParts[1] || '';
        const load = new Load({
          carrier_id,
          carrier_raw_extracted: carrierName,
          carrier_source: 'manual',
          driver_id,
          load_number: loadNumber,
          carrier_pay: price,
          pickup_date: pickupDate,
          delivery_date: deliveryDate,
          invoice_monday: invoiceMonday,
          invoice_week_id: invoiceWeekId,
          pickup_city,
          pickup_state,
          delivery_city,
          delivery_state,
          pdf_filename: req.file.originalname || path.basename(req.file.path),
          cancelled: false,
          confirmed: true,
          invoiced: true
        });
        await load.save();
        loadIds.push(load._id);
      }
    }
    const invoiceNumber = (data.invoiceNumber || '').trim() || `INV-OLD-${Date.now()}`;
    const invoiceDate = data.invoiceDate ? new Date(data.invoiceDate) : new Date();
    const dueDate = data.dueDate ? new Date(data.dueDate) : null;
    const subtotal = parseFloat(String(data.subtotal || data.total || '0').replace(/,/g, '')) || 0;
    const postage = parseFloat(String(data.postage || '0').replace(/,/g, '')) || 0;
    const total = parseFloat(String(data.total || data.balanceDue || '0').replace(/,/g, '')) || subtotal;
    const balanceDue = parseFloat(String(data.balanceDue || data.total || '0').replace(/,/g, '')) || total;
    const billTo = data.billTo && typeof data.billTo === 'object'
      ? { name: data.billTo.name || carrierName, cityStateZip: data.billTo.cityStateZip || '', phone: data.billTo.phone || '' }
      : { name: carrierName, cityStateZip: '', phone: '' };
    const payableTo = data.payableTo && typeof data.payableTo === 'object'
      ? { name: data.payableTo.name || '', cityStateZip: data.payableTo.cityStateZip || '', phone: data.payableTo.phone || '' }
      : { name: '', cityStateZip: '', phone: '' };
    const groupsForInvoice = groups.map(g => ({
      groupLabel: g.groupLabel || '',
      groupRate: g.groupRate || '',
      lines: (g.lines || []).map(l => ({
        pickupDate: l.pickupDate || '',
        deliveryDate: l.deliveryDate || '',
        originCityState: l.originCityState || '',
        destCityState: l.destCityState || '',
        price: l.price || '',
        ratePercent: l.ratePercent || '',
        amount: l.amount || ''
      }))
    }));
    const invoice = new Invoice({
      invoice_number: invoiceNumber,
      load_ids: loadIds,
      pdf_path: req.file.path,
      invoiceDate,
      dueDate,
      billTo,
      payableTo,
      subtotal,
      postage,
      total,
      balanceDue,
      groups: groupsForInvoice,
      carrier_name: carrierName
    });
    await invoice.save();
    const populated = await Invoice.findById(invoice._id)
      .populate('load_ids', 'load_number pickup_date delivery_date carrier_pay carrier_id invoice_monday invoice_week_id')
      .populate('load_ids.carrier_id', 'name aliases');
    res.status(201).json({
      success: true,
      invoice: populated,
      message: 'Invoice and loads created successfully'
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    res.status(500).json({ error: error.message });
  }
});

// Import old loads from XLSX and optionally create/pay invoices grouped by source_pdf
router.post('/import-old-loads-xlsx', uploadOldLoadsWorkbook.single('file'), async (req, res) => {
  let createdLoadIdsForCleanup = [];
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No workbook uploaded' });
    }

    const markLoadsInvoiced = req.body.mark_loads_invoiced === true || req.body.mark_loads_invoiced === 'true';
    const createInvoices = req.body.create_invoices === true || req.body.create_invoices === 'true';
    const markInvoicesPaid = req.body.mark_invoices_paid === true || req.body.mark_invoices_paid === 'true';

    if (markInvoicesPaid && !createInvoices) {
      return res.status(400).json({ error: 'mark_invoices_paid requires create_invoices' });
    }

    const parsedWorkbook = await parseOldLoadsWorkbook(req.file.path);
    const rows = Array.isArray(parsedWorkbook.rows) ? parsedWorkbook.rows : [];
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Workbook has no data rows' });
    }

    const groups = new Map();
    for (const row of rows) {
      const sourcePdf = (row.source_pdf || '').toString().trim();
      if (!sourcePdf) continue;
      if (!groups.has(sourcePdf)) groups.set(sourcePdf, []);
      groups.get(sourcePdf).push(row);
    }

    if (groups.size === 0) {
      return res.status(400).json({ error: 'Workbook rows must include source_pdf values' });
    }

    const success = [];
    const fail = [];

    for (const [sourcePdf, groupRows] of groups.entries()) {
      const localCreatedLoadIds = [];
      const invoiceLines = [];
      try {
        const sourceInfo = parseSourcePdfInfo(sourcePdf);
        const carrierFromColumn = firstTrimmedFieldInRows(groupRows, [
          'carrier_name',
          'carrier',
          'Carrier',
          'Carrier name',
          'carrier name'
        ]);
        const carrierName = (carrierFromColumn || sourceInfo?.carrierName || '').trim();
        if (!carrierName) {
          throw new Error(
            `Could not determine carrier (set carrier_name on rows or use a recognizable source_pdf path/name): ${sourcePdf}`
          );
        }

        const resolution = await resolveCarrier(carrierName);
        const carrier_id = resolution ? resolution.carrier_id : null;
        if (!carrier_id) {
          throw new Error(`Carrier "${carrierName}" not found. Add it in Settings first or create an alias.`);
        }

        const invoiceNumberBase =
          (groupRows.find((r) => (r.invoice_number || '').toString().trim())?.invoice_number || '').toString().trim() ||
          `OLDXLSX-${Date.now()}`;

        const invoiceDateRaw = firstTrimmedFieldInRows(groupRows, [
          'invoice_date',
          'Invoice date',
          'invoice date'
        ]);
        let invoiceDate = invoiceDateRaw ? parseWorkbookDate(invoiceDateRaw) : null;
        if (!invoiceDate && sourceInfo?.invoiceDate) {
          invoiceDate = sourceInfo.invoiceDate;
        }
        if (!invoiceDate) {
          invoiceDate = new Date();
        }
        const dueDate = new Date(invoiceDate.getTime() + 30 * MS_PER_DAY);

        for (const row of groupRows) {
          const pickupDate = parseWorkbookDate(row.pickup_date);
          const deliveryDate = parseWorkbookDate(row.delivery_date);
          if (!pickupDate || !deliveryDate) {
            throw new Error(`Invalid pickup/delivery date in source_pdf group ${path.basename(sourcePdf)}`);
          }
          const invoiceWeek = computeInvoiceWeekFields(pickupDate, deliveryDate);
          if (!invoiceWeek) {
            throw new Error(`Unable to compute invoice week for ${path.basename(sourcePdf)}`);
          }

          const origin = splitCityState(row.origin, '', '');
          const destination = splitCityState(row.destination, '', '');
          const generatedLoadNumber = `${invoiceNumberBase}-sample-${randomSixDigits()}`;
          const price = parseCurrencyInput(row.price);
          const amount = parseCurrencyInput(row.amount);
          const ratePercent = price > 0 ? `${((amount / price) * 100).toFixed(2)}%` : '';
          const load = new Load(applyTonuLocationRules({
            carrier_id,
            carrier_raw_extracted: carrierName,
            carrier_source: 'manual',
            driver_id: null,
            load_number: generatedLoadNumber,
            carrier_pay: price,
            detention_rate: 0,
            tonu: false,
            tonu_received: false,
            pickup_date: pickupDate,
            delivery_date: deliveryDate,
            invoice_monday: invoiceWeek.invoiceMonday,
            invoice_week_id: invoiceWeek.invoiceWeekId,
            pickup_city: origin.city,
            pickup_state: origin.state,
            delivery_city: destination.city,
            delivery_state: destination.state,
            pdf_filename: req.file.originalname || path.basename(req.file.path),
            rate_confirmation_path: null,
            cancelled: false,
            confirmed: true,
            invoiced: !createInvoices && markLoadsInvoiced
          }));
          await load.save();
          localCreatedLoadIds.push(load._id);
          createdLoadIdsForCleanup.push(load._id);
          invoiceLines.push({
            loadNumber: generatedLoadNumber,
            pickupDate: formatDate(pickupDate),
            deliveryDate: formatDate(deliveryDate),
            originCityState: [origin.city, origin.state].filter(Boolean).join(', '),
            destCityState: [destination.city, destination.state].filter(Boolean).join(', '),
            price,
            ratePercent,
            amount
          });
        }

        let invoice = null;
        if (createInvoices && localCreatedLoadIds.length > 0) {
          const subtotal = invoiceLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
          const result = await generateInvoicePDF(localCreatedLoadIds, {
            invoiceNumber: invoiceNumberBase,
            invoiceDate,
            dueDate,
            billTo: { name: carrierName },
            subtotal,
            postage: 0,
            total: subtotal,
            balanceDue: subtotal,
            groups: [{
              groupLabel: invoiceNumberBase,
              groupRate: '',
              lines: invoiceLines
            }]
          });
          invoice = new Invoice({
            invoice_number: invoiceNumberBase,
            load_ids: localCreatedLoadIds,
            pdf_path: result.pdfPath,
            invoiceDate: result.invoiceData.invoiceDate,
            dueDate: result.invoiceData.dueDate,
            billTo: result.invoiceData.billTo,
            payableTo: result.invoiceData.payableTo,
            subtotal: result.invoiceData.subtotal,
            postage: result.invoiceData.postage,
            total: result.invoiceData.total,
            balanceDue: result.invoiceData.balanceDue,
            cta: result.invoiceData.cta,
            paymentLine: result.invoiceData.paymentLine,
            groups: result.invoiceData.groups,
            carrier_name: carrierName
          });

          if (markInvoicesPaid) {
            invoice.paid = true;
            invoice.paid_date = invoiceDate;
            invoice.is_partial_payment = false;
            invoice.paid_amount = toCurrency(invoice.total || invoice.balanceDue || 0);
          }

          await invoice.save();
          await Load.updateMany(
            { _id: { $in: localCreatedLoadIds } },
            { $set: { invoiced: true } }
          );
        }

        success.push({
          source_pdf: sourcePdf,
          carrier: carrierName,
          invoice_number: invoiceNumberBase,
          loads_created: localCreatedLoadIds.length,
          invoice_created: Boolean(invoice),
          invoice_paid: Boolean(invoice && markInvoicesPaid)
        });
      } catch (groupError) {
        if (localCreatedLoadIds.length > 0) {
          await Load.deleteMany({ _id: { $in: localCreatedLoadIds } });
          createdLoadIdsForCleanup = createdLoadIdsForCleanup.filter(
            (id) => !localCreatedLoadIds.some((mine) => mine.toString() === id.toString())
          );
        }
        fail.push({
          source_pdf: sourcePdf,
          error: groupError.message
        });
      }
    }

    return res.status(201).json({
      success: true,
      workbook: req.file.originalname || path.basename(req.file.path),
      groups_processed: groups.size,
      success_groups: success,
      failed_groups: fail
    });
  } catch (error) {
    if (createdLoadIdsForCleanup.length > 0) {
      try {
        await Load.deleteMany({ _id: { $in: createdLoadIdsForCleanup } });
      } catch (cleanupError) {
        console.error('Failed cleanup after XLSX import error:', cleanupError);
      }
    }
    return res.status(500).json({ error: error.message });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
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

// Mark invoice as paid/unpaid
router.patch('/:id/paid', async (req, res) => {
  try {
    const { paid, paid_date, payment_type, payment_amount } = req.body;

    if (paid === undefined) {
      return res.status(400).json({ error: 'paid field is required' });
    }

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    invoice.paid = paid === true;
    if (invoice.paid) {
      if (!paid_date) {
        return res.status(400).json({ error: 'paid_date is required when marking invoice as paid' });
      }

      const parsedPaidDate = new Date(`${paid_date}T00:00:00.000Z`);
      if (Number.isNaN(parsedPaidDate.getTime())) {
        return res.status(400).json({ error: 'paid_date must be a valid date (YYYY-MM-DD)' });
      }

      const invoiceTotal = toCurrency(invoice.total || invoice.balanceDue || 0);
      const currentPaidAmount = toCurrency(invoice.paid_amount || 0);
      const paymentType = payment_type === 'partial' ? 'partial' : 'full';

      if (paymentType === 'partial') {
        const parsedPaymentAmount = Number(payment_amount);
        if (!Number.isFinite(parsedPaymentAmount) || parsedPaymentAmount <= 0) {
          return res.status(400).json({ error: 'payment_amount must be a positive number for partial payments' });
        }

        const nextPaidAmount = toCurrency(currentPaidAmount + parsedPaymentAmount);
        const remainingAfterPayment = toCurrency(Math.max(invoiceTotal - nextPaidAmount, 0));

        invoice.paid_date = parsedPaidDate;
        if (invoiceTotal > 0 && remainingAfterPayment <= EPSILON) {
          // If partial catches up to full total, promote status to fully paid.
          invoice.paid = true;
          invoice.is_partial_payment = false;
          invoice.paid_amount = invoiceTotal;
        } else {
          invoice.paid = false;
          invoice.is_partial_payment = true;
          invoice.paid_amount = nextPaidAmount;
        }
      } else {
        invoice.paid = true;
        invoice.paid_date = parsedPaidDate;
        invoice.is_partial_payment = false;
        invoice.paid_amount = invoiceTotal > 0 ? invoiceTotal : currentPaidAmount;
      }
    } else {
      invoice.paid_date = null;
      invoice.is_partial_payment = false;
      invoice.paid_amount = 0;
    }
    await invoice.save();

    const populated = await Invoice.findById(invoice._id)
      .populate('load_ids', 'load_number pickup_date delivery_date carrier_pay carrier_id invoice_monday invoice_week_id')
      .populate('load_ids.carrier_id', 'name aliases');

    res.json(populated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete invoice (and remove stored PDF if present)
router.delete('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const pdfPath = invoice.pdf_path;
    if (pdfPath && fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
      } catch (e) {
        // Don't fail the delete if file removal fails; report it.
        console.error('Failed to delete invoice PDF:', e);
      }
    }

    // Unmark loads as invoiced when invoice is deleted
    if (invoice.load_ids && Array.isArray(invoice.load_ids) && invoice.load_ids.length > 0) {
      await Load.updateMany(
        { _id: { $in: invoice.load_ids } },
        { $set: { invoiced: false } }
      );
    }

    await Invoice.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Invoice deleted successfully'
    });
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
        cancelled: false, // Always exclude cancelled loads
        invoiced: false // Always exclude invoiced loads
      };

      if (rule.carrier_id) {
        query.carrier_id = rule.carrier_id;
      }

      // For "default" rule, use computed dates: previous Saturday → current Monday
      const isDefaultRule = rule.rule_name && rule.rule_name.toLowerCase() === 'default';
      const defaultDates = isDefaultRule ? getDefaultRuleDatesUtc() : null;
      const earliest_pickup_date = defaultDates ? defaultDates.earliest_pickup_date : rule.earliest_pickup_date;
      const latest_delivery_date = defaultDates ? defaultDates.latest_delivery_date : rule.latest_delivery_date;

      // Weekly selection semantics:
      // - earliest_pickup_date is inclusive (start boundary)
      // - latest_delivery_date represents the "ending Monday" boundary
      //   - pickup ON the ending Monday should move to the next invoice => pickup_date is EXCLUSIVE (<)
      //   - delivery AFTER the ending Monday should move to the next invoice => delivery_date is INCLUSIVE (<=)
      if (earliest_pickup_date) {
        query.pickup_date = { $gte: earliest_pickup_date };
      }

      if (latest_delivery_date) {
        if (query.pickup_date) {
          query.pickup_date.$lt = latest_delivery_date;
        } else {
          query.pickup_date = { $lt: latest_delivery_date };
        }
        query.delivery_date = { $lte: latest_delivery_date };
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
        cancelled: false,
        invoiced: false // Always exclude invoiced loads
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

    // Split by carrier + invoice week so clicking "Generate Invoices" is automatic and safe.
    // The PDF generation assumes a single carrier for bill-to details.
    const loadsForGrouping = await Load.find({
      _id: { $in: loadIdsToUse },
      cancelled: false,
      invoiced: false // Double-check: exclude invoiced loads
    }).select('_id carrier_id pickup_date delivery_date invoice_monday invoice_week_id');

    const missingCarrier = loadsForGrouping.filter(l => !l.carrier_id).map(l => l._id);
    if (missingCarrier.length > 0) {
      return res.status(400).json({
        error: 'Some loads are missing carrier assignment. Assign a carrier before generating invoices.',
        missing_carrier_load_ids: missingCarrier
      });
    }

    // Auto-compute/backfill invoice fields for these loads (no Mongo date math).
    const invoiceFieldUpdates = [];
    const computedByLoadId = new Map(); // loadIdStr -> { invoiceMonday, invoiceWeekId }

    for (const l of loadsForGrouping) {
      if (!l.pickup_date || !l.delivery_date) {
        return res.status(400).json({
          error: 'Some loads are missing pickup_date or delivery_date; cannot generate invoices.'
        });
      }

      const computed = computeInvoiceWeekFields(l.pickup_date, l.delivery_date);
      if (!computed) {
        return res.status(400).json({
          error: 'Some loads have invalid pickup_date or delivery_date; cannot generate invoices.'
        });
      }

      computedByLoadId.set(l._id.toString(), computed);

      const existingMondayMs = l.invoice_monday ? new Date(l.invoice_monday).getTime() : null;
      const computedMondayMs = computed.invoiceMonday.getTime();
      const existingWeekId = l.invoice_week_id || null;

      const needsUpdate =
        existingMondayMs !== computedMondayMs ||
        existingWeekId !== computed.invoiceWeekId;

      if (needsUpdate) {
        invoiceFieldUpdates.push({
          updateOne: {
            filter: { _id: l._id },
            update: {
              $set: {
                invoice_monday: computed.invoiceMonday,
                invoice_week_id: computed.invoiceWeekId
              }
            }
          }
        });
      }
    }

    if (invoiceFieldUpdates.length > 0) {
      await Load.bulkWrite(invoiceFieldUpdates, { ordered: false });
    }

    const byCarrierAndWeek = new Map(); // `${carrierIdStr}|${invoiceWeekId}` -> loadId[]
    for (const l of loadsForGrouping) {
      const carrierIdStr = l.carrier_id.toString();
      const computed = computedByLoadId.get(l._id.toString());
      const invoiceWeekId = computed ? computed.invoiceWeekId : (l.invoice_week_id || null);
      if (!invoiceWeekId) {
        return res.status(400).json({
          error: 'Unable to determine invoice week for one or more loads.'
        });
      }

      const key = `${carrierIdStr}|${invoiceWeekId}`;
      if (!byCarrierAndWeek.has(key)) byCarrierAndWeek.set(key, []);
      byCarrierAndWeek.get(key).push(l._id);
    }

    const baseInvoiceNumber = invoiceData?.invoiceNumber || `INV-${Date.now()}`;
    const groupKeys = Array.from(byCarrierAndWeek.keys()).sort();

    const createdInvoices = [];
    for (let i = 0; i < groupKeys.length; i += 1) {
      const key = groupKeys[i];
      const loadIds = byCarrierAndWeek.get(key) || [];
      if (loadIds.length === 0) continue;

      const parts = key.split('|');
      const invoiceWeekId = parts[1] || '';
      const weekCompact = invoiceWeekId ? invoiceWeekId.replace(/-/g, '') : 'unknownweek';

      // Ensure uniqueness if we end up creating multiple invoices in one request.
      const invoiceNumber =
        groupKeys.length === 1
          ? baseInvoiceNumber
          : `${baseInvoiceNumber}-${weekCompact}-${String(i + 1).padStart(2, '0')}`;

      const invoiceWeekMonday = parseInvoiceWeekIdToUtcMonday(invoiceWeekId);
      const endingMonday =
        invoiceWeekMonday ? new Date(invoiceWeekMonday.getTime() + 7 * MS_PER_DAY) : null;
      const endingMondayId = endingMonday ? endingMonday.toISOString().slice(0, 10) : null;

      const result = await generateInvoicePDF(loadIds, {
        ...(invoiceData || {}),
        invoiceNumber,
        endingMonday: endingMondayId
      });

      const pdfPath = result.pdfPath;
      const fullInvoiceData = result.invoiceData;

      const invoice = new Invoice({
        invoice_number: invoiceNumber,
        load_ids: loadIds,
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
      createdInvoices.push(invoice);
    }

    // Mark all loads in the created invoices as invoiced
    const allInvoicedLoadIds = [];
    for (const invoice of createdInvoices) {
      if (invoice.load_ids && Array.isArray(invoice.load_ids)) {
        allInvoicedLoadIds.push(...invoice.load_ids);
      }
    }

    if (allInvoicedLoadIds.length > 0) {
      await Load.updateMany(
        { _id: { $in: allInvoicedLoadIds } },
        { $set: { invoiced: true } }
      );
    }

    const populatedInvoices = await Invoice.find({ _id: { $in: createdInvoices.map(i => i._id) } })
      .populate('load_ids', 'load_number pickup_date delivery_date carrier_pay')
      .sort({ generated_at: -1 });

    res.status(201).json({
      success: true,
      invoices: populatedInvoices,
      count: populatedInvoices.length,
      message: populatedInvoices.length === 1 ? 'Invoice generated successfully' : 'Invoices generated successfully'
    });

  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

