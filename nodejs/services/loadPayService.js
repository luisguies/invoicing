function toMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function getLoadTotalCarrierPay(load) {
  const base = toMoney(load?.carrier_pay || 0);
  const detention = toMoney(load?.detention_rate || 0);
  return toMoney(base + detention);
}

function appendTonuSuffix(value) {
  const text = (value || '').toString().trim();
  if (!text) return 'TONU';
  if (/\(TONU\)$/i.test(text)) return text;
  return `${text} (TONU)`;
}

function removeTonuSuffix(value) {
  return (value || '').toString().replace(/\s*\(TONU\)\s*$/i, '').trim();
}

function applyTonuLocationRules(loadLike) {
  if (loadLike?.tonu) {
    loadLike.pickup_city = appendTonuSuffix(loadLike.pickup_city);
    loadLike.delivery_city = appendTonuSuffix(loadLike.delivery_city);
    loadLike.pickup_state = (loadLike.pickup_state || '').toString().trim() || 'XX';
    loadLike.delivery_state = (loadLike.delivery_state || '').toString().trim() || 'XX';
    return loadLike;
  }

  loadLike.pickup_city = removeTonuSuffix(loadLike.pickup_city);
  loadLike.delivery_city = removeTonuSuffix(loadLike.delivery_city);
  return loadLike;
}

module.exports = {
  toMoney,
  getLoadTotalCarrierPay,
  applyTonuLocationRules
};
