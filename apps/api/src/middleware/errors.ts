import type { Context } from 'hono'
import { ZodError } from 'zod'

export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 502 | 503,
    readonly code: string,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message)
  }
}

export const unauthorized = () => new ApiError(401, 'unauthorized', 'Credencial requerida o inválida.')
export const forbidden = () => new ApiError(403, 'forbidden', 'La operación excede tus permisos.')
export const notFound = () => new ApiError(404, 'not_found', 'Recurso no encontrado.')
export const conflict = (message: string) => new ApiError(409, 'conflict', message)

export function handleError(error: Error, context: Context) {
  if (error instanceof ApiError) {
    if (error.retryAfter) context.header('Retry-After', String(error.retryAfter))
    if (error.status === 401) context.header('WWW-Authenticate', 'Bearer')
    return context.json({ error: { code: error.code, message: error.message } }, error.status)
  }
  if (error instanceof ZodError) {
    return context.json({
      error: {
        code: 'validation_error',
        message: 'La solicitud contiene campos inválidos.',
        fields: error.issues.map(({ path, code }) => ({ path: path.join('.'), code })),
      },
    }, 400)
  }
  const code = 'code' in error ? error.code : undefined
  if (code === '23505' || code === '23503') {
    return context.json({ error: { code: 'conflict', message: 'El registro entra en conflicto con datos existentes.' } }, 409)
  }
  if (code === '23514') {
    return context.json({ error: { code: 'constraint_violation', message: 'El registro incumple una regla de integridad.' } }, 422)
  }
  const sqlstate = typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : undefined
  console.error(JSON.stringify({ event: 'api_error', requestId: context.res.headers.get('X-Request-ID'), sqlstate }))
  const temporary = sqlstate && /^(40|08|53|57P)/.test(sqlstate)
  return context.json({ error: { code: 'internal_error', message: 'El servicio no pudo completar la solicitud.' } },
    temporary ? 503 : 500)
}
