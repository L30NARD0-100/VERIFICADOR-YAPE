import { createClient } from '@supabase/supabase-js'
import { ApiError, unauthorized } from '../middleware/errors.js'

export interface AuthService {
  authenticate(token: string): Promise<string>
  invite(email: string): Promise<string>
}

export function supabaseAuth(url: string, anonKey: string, serviceKey: string): AuthService {
  const options = { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) } }
  const auth = createClient(url, anonKey, options).auth
  const admin = createClient(url, serviceKey, options).auth.admin
  return {
    async authenticate(token) {
      const { data, error } = await auth.getUser(token)
      if (error && (!error.status || error.status >= 500)) {
        throw new ApiError(503, 'auth_unavailable', 'El servicio de identidad no está disponible.')
      }
      if (error || !data.user) throw unauthorized()
      return data.user.id
    },
    async invite(email) {
      const { data, error } = await admin.inviteUserByEmail(email)
      if (error || !data.user) {
        throw new ApiError(502, 'invitation_failed', 'No se pudo completar la invitación en Supabase Auth.')
      }
      return data.user.id
    },
  }
}

export function bearer(header: string | undefined) {
  const token = /^Bearer ([A-Za-z0-9._~-]{1,4096})$/i.exec(header ?? '')?.[1]
  if (!token) throw unauthorized()
  return token
}
