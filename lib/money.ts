/** Rounds a money amount to cents. Use before writing amounts to the database. */
export function roundMoney(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Rounds an exchange rate to 4 decimals (NBT publishes 4). */
export function roundRate(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 10000) / 10000
}
