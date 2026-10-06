/** Rounds a money amount to cents. Use before writing amounts to the database. */
export function roundMoney(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  // Round half away from zero for both signs, and never return -0
  const r = (Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100
  return r === 0 ? 0 : r
}

/** Rounds an exchange rate to 4 decimals (NBT publishes 4). */
export function roundRate(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  const r = (Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 10000)) / 10000
  return r === 0 ? 0 : r
}
