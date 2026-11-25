import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { companyPath } from '../services/api'
import type { Page, Params } from '../types/api'
import { useApi } from './session'

export const activityKey = (company: string) => ['company', company, 'activity'] as const
export const resourceKey = (company: string, resource: string) => ['company', company, resource] as const

export function useAll<T>(company: string, resource: string) {
  const api = useApi()
  return useQuery({
    queryKey: [...resourceKey(company, resource), 'all'],
    queryFn: ({ signal }) => api.all<T>(companyPath(company) + '/' + resource, signal),
  })
}

export function usePage<T>(key: readonly unknown[], path: string, params: Params = {}, limit = 15) {
  const api = useApi()
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const cursor = cursors.at(-1)
  const result = useQuery({
    queryKey: [...key, params, cursor ?? null, limit],
    queryFn: ({ signal }) => api.json<Page<T>>(path, { signal, params: { ...params, cursor, limit } }),
  })
  const nextCursor = result.data?.next_cursor
  return {
    ...result,
    pagination: {
      page: cursors.length,
      hasNext: Boolean(nextCursor),
      next: () => { if (nextCursor) setCursors((previous) => [...previous, nextCursor]) },
      previous: () => setCursors((previous) => previous.length > 1 ? previous.slice(0, -1) : previous),
      busy: result.isFetching,
    },
  }
}
