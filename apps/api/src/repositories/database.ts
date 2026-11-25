import type { Pool, PoolClient, QueryResultRow } from 'pg'
import { ApiError } from '../middleware/errors.js'

export async function transaction<T>(pool: Pool, work: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect()
  let discardConnection = false
  try {
    await db.query('begin')
    const value = await work(db)
    await db.query('commit')
    return value
  } catch (error) {
    try {
      await db.query('rollback')
    } catch {
      discardConnection = true
    }
    throw error
  } finally {
    db.release(discardConnection)
  }
}

export function asUser<T>(pool: Pool, id: string, work: (db: PoolClient) => Promise<T>) {
  return transaction(pool, async (db) => {
    await db.query('set transaction isolation level repeatable read read only')
    await db.query('set local role authenticated')
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: id, role: 'authenticated' }),
    ])
    return work(db)
  })
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  db: Pick<PoolClient, 'query'>, query: string, values: unknown[] = [],
) {
  return (await db.query<T>(query, values)).rows[0]
}

export async function consumeRate(pool: Pool, bucket: string, limit: number) {
  const row = await one<{ hits: number; retry_after: number }>(pool, `
    insert into app_private.api_rate_limits as counter (bucket, window_started_at, hits)
    values ($1, date_trunc('minute', statement_timestamp()), 1)
    on conflict (bucket) do update set
      hits = case when counter.window_started_at < excluded.window_started_at then 1
        else least(counter.hits, $2::integer) + 1 end,
      window_started_at = greatest(counter.window_started_at, excluded.window_started_at)
    returning hits, greatest(1, ceil(extract(epoch from
      window_started_at + interval '1 minute' - clock_timestamp())))::integer as retry_after
  `, [bucket, limit])
  if (!row || row.hits > limit) {
    throw new ApiError(429, 'rate_limited', 'Demasiadas solicitudes. Reintenta más tarde.', row?.retry_after ?? 60)
  }
}
