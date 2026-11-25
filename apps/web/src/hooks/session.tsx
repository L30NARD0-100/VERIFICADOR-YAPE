import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { passwordLink, supabase } from '../lib/supabase'
import { createApi, type Api } from '../services/api'

type SessionState = {
  session: Session | null; loading: boolean; passwordFlow: boolean; error: Error | null
  clearPasswordFlow: () => void; signOut: () => Promise<void>
}
const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [passwordFlow, setPasswordFlow] = useState(passwordLink)
  const [error, setError] = useState<Error | null>(null)
  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    let authEventReceived = false
    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => {
      if (!active) return
      authEventReceived = true
      setSession(next)
      setError(null)
      setLoading(false)
      if (event === 'PASSWORD_RECOVERY') setPasswordFlow(true)
      if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !next)) setPasswordFlow(false)
    })
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || authEventReceived) return
      setSession(data.session)
      setError(sessionError)
      setLoading(false)
    }).catch((cause: Error) => {
      if (!active || authEventReceived) return
      setError(cause)
      setLoading(false)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  async function signOut() {
    const { error } = await supabase!.auth.signOut({ scope: 'local' })
    if (error) throw error
  }
  return <SessionContext.Provider value={{
    session, loading, passwordFlow, error, clearPasswordFlow: () => setPasswordFlow(false), signOut,
  }}>{children}</SessionContext.Provider>
}

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('Falta el proveedor de sesión.')
  return value
}
export function useApi(): Api {
  const { session } = useSession()
  const token = session?.access_token ?? ''
  return useMemo(() => createApi(token), [token])
}
