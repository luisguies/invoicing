const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUtcMidnight(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function datesHaveSameUtcYmd(a, b) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Corrected rule:
 * - invoice Monday is the Monday of the delivery week (delivery on Monday stays that Monday)
 * - exception: if pickup happens on that invoice Monday (same calendar date), push to next week
 *
 * Returns:
 * - invoiceMonday: Date at UTC midnight
 * - invoiceWeekId: "YYYY-MM-DD"
 */
function computeInvoiceWeekFields(pickupDate, deliveryDate) {
  const pickupMidnight = toUtcMidnight(pickupDate);
  const deliveryMidnight = toUtcMidnight(deliveryDate);
  if (!pickupMidnight || !deliveryMidnight) return null;

  const deliveryDow = deliveryMidnight.getUTCDay(); // Sun=0 ... Sat=6
  const daysSinceMonday = deliveryDow === 0 ? 6 : deliveryDow - 1; // Mon=0 ... Sun=6

  let invoiceMonday = new Date(deliveryMidnight.getTime() - daysSinceMonday * MS_PER_DAY);

  if (datesHaveSameUtcYmd(pickupMidnight, invoiceMonday)) {
    invoiceMonday = new Date(invoiceMonday.getTime() + 7 * MS_PER_DAY);
  }

  const invoiceWeekId = invoiceMonday.toISOString().slice(0, 10);

  return { invoiceMonday, invoiceWeekId };
}

module.exports = {
  computeInvoiceWeekFields,
  toUtcMidnight
};


