import type { PoolClient } from 'pg'
import { ApiError } from '../middleware/errors.js'
import { cursorValue } from '../schemas/contracts.js'

export class Where {
  clauses: string[] = []

  constructor(readonly values: unknown[] = []) {}

  addValue(value: unknown) {
    return '$' + this.values.push(value)
  }

  add(clause: string) {
    this.clauses.push(clause)
  }

  equals(column: string, value: unknown) {
    if (value !== undefined) this.add(`${column} = ${this.addValue(value)}`)
  }

  sql() {
    return this.clauses.length ? 'where ' + this.clauses.join(' and ') : ''
  }
}

type PageOptions = { cursor?: string; limit: number; order?: 'asc' | 'desc' }

export async function paginated(
  db: PoolClient, options: PageOptions, where: Where,
  query: { columns: string; from: string; timestamp: string; id: string },
) {
  const { limit, cursor, order = 'desc' } = options
  const { columns, from, timestamp, id } = query
  if (cursor) {
    let decoded: unknown
    try {
      decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    } catch {
      throw new ApiError(400, 'invalid_cursor', 'Cursor inválido.')
    }
    const result = cursorValue.safeParse(decoded)
    if (!result.success) throw new ApiError(400, 'invalid_cursor', 'Cursor inválido.')
    const [date, key] = result.data
    where.add(`(${timestamp}, ${id}) ${order === 'asc' ? '>' : '<'}
      (${where.addValue(date)}::timestamptz, ${where.addValue(key)}::uuid)`)
  }
  const result = await db.query(`
    select ${columns}, to_char(${timestamp} at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_time, ${id} as cursor_id
    from ${from} ${where.sql()}
    order by ${timestamp} ${order}, ${id} ${order}
    limit ${where.addValue(limit + 1)}
  `, where.values)
  const rows = result.rows.slice(0, limit)
  const last = rows.at(-1)
  return {
    data: rows.map(({ cursor_time: _time, cursor_id: _id, ...row }) => row),
    next_cursor: last && result.rows.length > limit
      ? Buffer.from(JSON.stringify([last.cursor_time, last.cursor_id])).toString('base64url')
      : null,
  }
}
