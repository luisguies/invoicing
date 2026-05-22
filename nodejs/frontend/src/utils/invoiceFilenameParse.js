/** Aligns with server routes/invoices.js: dashed dates after " Invoice " in PDF filenames. */

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

function parseInvoiceDateYmdParts(year, month, day) {
  const invoiceDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  return Number.isNaN(invoiceDate.getTime()) ? null : invoiceDate;
}

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

function parseFlexibleInvoiceSuffixDate(suffix) {
  if (!suffix) return null;
  const t = suffix.trim();
  let d = parseFlexibleDashDateSegment(t);
  if (d) return d;
  const first = t.split(/\s+/)[0];
  return parseFlexibleDashDateSegment(first);
}

/**
 * @param {string} name - PDF filename (basename)
 * @returns {{ carrierName: string, dateStr: string } | null}
 */
export function parseOldInvoiceUploadFilename(name) {
  const base = name.endsWith('.pdf') ? name : `${name}.pdf`;
  const withoutExt = base.replace(/\.[^.]+$/i, '');
  const idx = withoutExt.toLowerCase().lastIndexOf(' invoice ');
  if (idx === -1) return null;
  const carrierName = withoutExt.slice(0, idx).trim();
  if (!carrierName) return null;
  const suffix = withoutExt.slice(idx + ' invoice '.length).trim();
  const date = parseFlexibleInvoiceSuffixDate(suffix);
  if (!date) return null;
  return {
    carrierName,
    dateStr: date.toISOString().slice(0, 10)
  };
}
