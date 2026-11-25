import { apiUrl } from '../lib/supabase'
import type { Page, Params } from '../types/api'

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export function queryString(params?: Params) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  return query.size ? '?' + query.toString() : ''
}

type Options = { method?: 'POST' | 'PATCH'; data?: unknown; params?: Params; signal?: AbortSignal }

export function createApi(token: string) {
  async function request(path: string, options: Options = {}) {
    const response = await fetch(apiUrl + '/api' + path + queryString(options.params), {
      method: options.method ?? 'GET',
      credentials: 'omit',
      headers: {
        Authorization: 'Bearer ' + token,
        ...(options.data !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.data === undefined ? undefined : JSON.stringify(options.data),
      signal: options.signal,
    })
    if (!response.ok) {
      const envelope = await response.json().catch(() => undefined)
      throw new ApiError(response.status, envelope?.error?.message ?? 'No se pudo completar la solicitud.')
    }
    return response
  }
  async function json<T>(path: string, options?: Options): Promise<T> {
    const response = await request(path, options)
    return response.status === 204 ? undefined as T : response.json()
  }
  async function all<T>(path: string, signal?: AbortSignal) {
    const rows: T[] = []
    let cursor: string | undefined
    do {
      const page: Page<T> = await json(path, { params: { limit: 100, cursor }, signal })
      rows.push(...page.data)
      cursor = page.next_cursor ?? undefined
    } while (cursor)
    return rows
  }
  return { request, json, all }
}
export type Api = ReturnType<typeof createApi>
export const companyPath = (id: string) => '/companies/' + encodeURIComponent(id)
