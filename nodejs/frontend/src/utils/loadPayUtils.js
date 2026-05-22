export const toMoney = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

export const getLoadTotalCarrierPay = (load) => {
  const base = toMoney(load?.carrier_pay || 0);
  const detention = toMoney(load?.detention_rate || 0);
  return toMoney(base + detention);
};
