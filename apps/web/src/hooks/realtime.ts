import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { activityKey } from './data'

export type SyncStatus = 'connecting' | 'live' | 'degraded' | 'offline'
const reconnectDelay = 3000

export function useRealtime(company: string) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<SyncStatus>('connecting')
  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    let channel: ReturnType<typeof client.channel> | undefined

    function invalidate() {
      if (!active) return
      clearTimeout(timer)
      timer = setTimeout(() => { void queryClient.invalidateQueries({ queryKey: activityKey(company) }) }, 120)
    }

    function connect() {
      if (!active || !navigator.onLine || !client || channel) return
      setState('connecting')
      const joining = client.channel('company-payments:' + company + ':' + crypto.randomUUID())
      channel = joining
      for (const table of ['payments', 'payment_events']) {
        joining.on('postgres_changes', { event: '*', schema: 'public', table, filter: 'company_id=eq.' + company }, invalidate)
      }
      joining.subscribe((status) => {
        if (!active || channel !== joining) return
        if (status === 'SUBSCRIBED') {
          setState(navigator.onLine ? 'live' : 'offline')
          invalidate()
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Supabase reintenta la conexión del canal. Mientras tanto, se consulta la API.
          setState(navigator.onLine ? 'degraded' : 'offline')
          invalidate()
        }
        if (status === 'CLOSED') {
          channel = undefined
          void client.removeChannel(joining)
          setState(navigator.onLine ? 'degraded' : 'offline')
          invalidate()
          clearTimeout(retry)
          retry = setTimeout(connect, reconnectDelay)
        }
      })
    }
    function online() {
      setState('connecting')
      connect()
      invalidate()
    }
    function offline() {
      setState('offline')
      const previous = channel
      channel = undefined
      if (previous) void client?.removeChannel(previous)
    }
    const focus = () => { if (navigator.onLine) invalidate() }
    connect()
    if (!navigator.onLine) offline()
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    window.addEventListener('focus', focus)
    return () => {
      active = false
      clearTimeout(timer)
      clearTimeout(retry)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      window.removeEventListener('focus', focus)
      if (channel) void client.removeChannel(channel)
    }
  }, [company, queryClient])
  useEffect(() => {
    if (state === 'offline') return
    const poll = setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        void queryClient.invalidateQueries({ queryKey: activityKey(company) })
      }
    }, state === 'live' ? 60000 : 15000)
    return () => clearInterval(poll)
  }, [company, queryClient, state])
  return state
}
