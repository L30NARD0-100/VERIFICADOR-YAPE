import { Activity, Clock3, LockKeyhole, Mail, Radio, ShieldCheck, Wallet } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { authLinkError, supabase } from '../lib/supabase'
import { useSession } from '../hooks/session'
import { ErrorNotice, Field, Loading } from '../components/common'
import { Button } from '../components/ui/button'

export function Brand() {
  return <span className="brand"><span className="brand-mark"><Activity size={21} strokeWidth={2.6} /></span> Yape Monitor</span>
}
function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="auth-layout">
    <aside className="auth-aside">
      <Brand />
      <div className="auth-hero">
        <div className="auth-icon"><Wallet size={38} strokeWidth={1.55} /></div>
        <h2>Monitorea tus cobros en un solo lugar.</h2>
        <p>Consulta las notificaciones del negocio, coordina tus cajas y revisa la actividad de cada sucursal.</p>
        <ul>
          <li><Radio size={19} /> Notificaciones en tiempo real</li>
          <li><Clock3 size={19} /> Historial por fecha y sucursal</li>
          <li><ShieldCheck size={19} /> Acceso según tu rol</li>
        </ul>
      </div>
      <div className="auth-orbit" aria-hidden="true" />
    </aside>
    <div className="auth-content"><div className="auth-mobile-brand"><Brand /></div><div className="auth-card">{children}</div></div>
  </main>
}

function recoveryRedirect() {
  return new URL('/restablecer', window.location.origin).href
}

export function AuthPage({ mode }: { mode: 'login' | 'forgot' | 'reset' }) {
  const { session, loading, passwordFlow, error: sessionError, clearPasswordFlow } = useSession()
  const navigate = useNavigate()
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  if (loading) return <AuthLayout><Loading label="Verificando sesión…" /></AuthLayout>
  if (session && passwordFlow && mode !== 'reset') return <Navigate to="/restablecer" replace />
  if (session && !passwordFlow && mode !== 'reset') return <Navigate to="/" replace />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const client = supabase
    if (!client) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try {
      const email = String(form.get('email') ?? '').trim()
      const password = String(form.get('password') ?? '')
      if (mode === 'login') {
        const result = await client.auth.signInWithPassword({ email, password })
        if (result.error) {
          if (result.error.code === 'invalid_credentials') throw new Error('El correo o la contraseña son incorrectos.')
          throw result.error
        }
        navigate('/', { replace: true })
      } else if (mode === 'forgot') {
        const result = await client.auth.resetPasswordForEmail(email, { redirectTo: recoveryRedirect() })
        if (result.error) throw result.error
        setSent(true)
      } else {
        if (password !== form.get('confirmation')) throw new Error('Las contraseñas deben coincidir.')
        const result = await client.auth.updateUser({ password })
        if (result.error) throw result.error
        clearPasswordFlow()
        navigate('/', { replace: true })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('No se pudo completar la solicitud.'))
    } finally {
      setBusy(false)
    }
  }

  const resetUnavailable = mode === 'reset' && (!session || !passwordFlow)
  return <AuthLayout>
    <span className="auth-form-icon"><LockKeyhole size={23} /></span>
    <h1>{mode === 'login' ? 'Iniciar sesión' : mode === 'forgot' ? 'Recuperar contraseña' : 'Define tu contraseña'}</h1>
    <p className="auth-description">{mode === 'login' ? 'Ingresa con la cuenta de tu negocio.' :
      mode === 'forgot' ? 'Te enviaremos un enlace al correo de tu cuenta.' : 'Usa al menos ocho caracteres.'}</p>
    {!supabase && <div className="error-notice" role="alert">Configura la URL y la clave pública de Supabase y la URL de la API para habilitar el acceso.</div>}
    {authLinkError && mode === 'login' && <div className="error-notice" role="alert">El enlace no está disponible. Solicita un nuevo enlace de recuperación.</div>}
    {(error || sessionError) && <ErrorNotice error={error ?? sessionError} />}
    {resetUnavailable ? <div className="auth-recovery">
      <p>El enlace de acceso falta o ha caducado.</p><Link to="/recuperar">Solicitar otro enlace</Link>
    </div> : sent ? <div className="success-notice" role="status"><Mail size={20} /> Revisa tu correo. Si la cuenta existe, recibirás el enlace.</div>
      : <form onSubmit={submit} className="stack-form">
        {mode !== 'reset' && <Field label="Correo electrónico"><input name="email" type="email" autoComplete="email" required placeholder="nombre@empresa.pe" /></Field>}
        {mode !== 'forgot' && <Field label={mode === 'reset' ? 'Nueva contraseña' : 'Contraseña'}>
          <input name="password" type="password" autoComplete={mode === 'reset' ? 'new-password' : 'current-password'} required minLength={mode === 'reset' ? 8 : undefined} />
        </Field>}
        {mode === 'reset' && <Field label="Confirmar contraseña"><input name="confirmation" type="password" autoComplete="new-password" required minLength={8} /></Field>}
        {mode === 'login' && <Link className="auth-text-link" to="/recuperar">¿Olvidaste tu contraseña?</Link>}
        <Button type="submit" disabled={busy || !supabase}>
          {busy ? 'Procesando…' : mode === 'login' ? 'Entrar al panel' : mode === 'forgot' ? 'Enviar enlace' : 'Guardar contraseña'}
        </Button>
      </form>}
    {mode !== 'login' && <Link className="auth-back" to="/login">Volver al inicio de sesión</Link>}
  </AuthLayout>
}
