export const limaZone = 'America/Lima'
const dateTimeFormat = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'short', timeStyle: 'short', timeZone: limaZone,
})
const dayFormat = new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: limaZone })
const timeFormat = new Intl.DateTimeFormat('es-PE', { timeStyle: 'short', timeZone: limaZone })
const localDate = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: limaZone,
})
export const dateTime = (value?: string | null) => value ? dateTimeFormat.format(new Date(value)) : '—'
export const time = (value: string) => timeFormat.format(new Date(value))
export const todayLabel = () => dayFormat.format(new Date())
export const todayInLima = () => localDate.format(new Date())

export function dateRange(days: number) {
  const to = todayInLima()
  const from = new Date(to + 'T00:00:00Z')
  from.setUTCDate(from.getUTCDate() - days + 1)
  return { from: from.toISOString().slice(0, 10), to }
}

export function money(amount: string | null, currency: string | null) {
  if (amount === null) return '—'
  if (!currency) return amount
  // Intl accepts decimal strings and preserves precision for aggregate amounts.
  const formatter = new Intl.NumberFormat('es-PE', {
    style: 'currency', currency, currencyDisplay: 'symbol', minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
  return formatter.format(amount as unknown as number)
}

export function totalEvents(values: Record<string, string | undefined>) {
  return Object.values(values).reduce((total, value) => total + BigInt(value ?? '0'), 0n).toLocaleString('es-PE')
}
