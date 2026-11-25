import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
export const apiUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '')
export const passwordLink = ['recovery', 'invite'].includes(
  new URLSearchParams(window.location.hash.slice(1)).get('type') ?? '',
)
export const authLinkError = new URLSearchParams(window.location.hash.slice(1)).has('error') ||
  new URLSearchParams(window.location.search).has('error')

export const supabase = url && key && apiUrl ? createClient(url, key) : null
