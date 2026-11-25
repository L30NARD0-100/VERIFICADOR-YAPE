import type { Hono, Context } from 'hono'
import type { z } from 'zod'
import { ApiError } from '../middleware/errors.js'
import type { AuthService } from '../services/auth.js'
import type { Pool } from 'pg'

export type Dependencies = { pool: Pool; auth: AuthService; frontendOrigin: string }
export type ApiEnv = { Variables: { profile: string } }
export type Router = Hono<ApiEnv>
export type ApiContext = Context<ApiEnv>

export async function body<T extends z.ZodType>(context: ApiContext, schema: T): Promise<z.output<T>> {
  if (context.req.header('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new ApiError(400, 'invalid_content_type', 'Envía un cuerpo application/json.')
  }
  let payload: unknown
  try {
    payload = await context.req.json()
  } catch {
    throw new ApiError(400, 'invalid_json', 'El cuerpo debe contener JSON válido.')
  }
  return schema.parse(payload)
}

export function query<T extends z.ZodType>(context: ApiContext, schema: T): z.output<T> {
  const params = context.req.queries()
  const pairs = Object.entries(params).map(([key, values]) => {
    if (values.length !== 1) throw new ApiError(400, 'repeated_filter', 'Cada filtro se puede indicar una vez.')
    return [key, values[0]]
  })
  return schema.parse(Object.fromEntries(pairs))
}
