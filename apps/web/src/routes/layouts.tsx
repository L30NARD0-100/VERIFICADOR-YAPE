import { useQuery } from '@tanstack/react-query'
import {
  Activity, Building2, ChartNoAxesCombined, ClipboardList, CreditCard, LayoutDashboard, LogOut,
  Menu, Smartphone, Store, Users, X,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { Empty, ErrorNotice, Loading, PageTitle } from '../components/common'
import { Button } from '../components/ui/button'
import { useRealtime, type SyncStatus } from '../hooks/realtime'
import { useApi, useSession } from '../hooks/session'
import { companyPath } from '../services/api'
import type { Company, Identity, Role } from '../types/api'
import { Brand } from '../pages/auth'

export const roleLabel: Record<Role, string> = { COMPANY_ADMIN: 'Administrador', MANAGER: 'Gerente', CASHIER: 'Cajero' }
export function companyHome(company: string, role: Role) {
  return `/empresas/${company}/${role === 'CASHIER' ? 'pagos' : 'resumen'}`
}
export function canVisit(role: Role, section: string) {
  if (section === 'usuarios' || section === 'actividad') return role === 'COMPANY_ADMIN'
  return true
}

export function RequireSession() {
  const { session, loading, passwordFlow } = useSession()
  if (loading) return <div className="center-screen"><Loading label="Verificando sesión…" /></div>
  if (!session) return <Navigate to="/login" replace />
  if (passwordFlow) return <Navigate to="/restablecer" replace />
  return <IdentityLayout />
}

function IdentityLayout() {
  const api = useApi()
  const result = useQuery({
    queryKey: ['identity'], queryFn: ({ signal }) => api.json<Identity>('/me', { signal }), refetchInterval: 30_000,
  })
  if (result.isPending) return <div className="center-screen"><Loading label="Cargando perfil…" /></div>
  if (result.isError) return <div className="center-screen">
    <ErrorNotice error={result.error} retry={() => { void result.refetch() }} /><SignOut />
  </div>
  if (result.data.profile.status === 'inactive') return <div className="center-screen">
    <Empty title="Cuenta inactiva" description="Contacta al administrador de tu negocio." /><SignOut />
  </div>
  return <Outlet context={result.data} />
}
export const useIdentity = () => useOutletContext<Identity>()
export function Home() {
  const identity = useIdentity()
  const membership = identity.memberships.find((item) => item.status === 'active')
  if (identity.is_platform_admin || !membership) return <Navigate to="/empresas" replace />
  return <Navigate to={companyHome(membership.company_id, membership.role)} replace />
}

type CompanyContext = { company: Company; identity: Identity; role: Role; sync: SyncStatus }
export const useCompany = () => useOutletContext<CompanyContext>()
const nav = [
  { to: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { to: 'pagos', label: 'Pagos', icon: CreditCard },
  { to: 'reportes', label: 'Reportes', icon: ChartNoAxesCombined },
  { to: 'sucursales', label: 'Sucursales', icon: Store },
  { to: 'dispositivos', label: 'Dispositivos', icon: Smartphone },
  { to: 'usuarios', label: 'Usuarios', icon: Users },
  { to: 'actividad', label: 'Actividad', icon: ClipboardList },
] as const

export function CompanyLayout() {
  const identity = useIdentity()
  const api = useApi()
  const { companyId = '' } = useParams()
  const member = identity.memberships.find((item) => item.company_id === companyId && item.status === 'active')
  const result = useQuery({
    queryKey: ['company', companyId, 'details'],
    queryFn: ({ signal }) => api.json<Company>(companyPath(companyId), { signal }),
    enabled: Boolean(member || identity.is_platform_admin),
  })
  if (!member && !identity.is_platform_admin) return <Navigate to="/empresas" replace />
  if (result.isPending) return <div className="center-screen"><Loading label="Cargando empresa…" /></div>
  if (result.isError) return <WorkspaceShell identity={identity}>
    <ErrorNotice error={result.error} retry={() => { void result.refetch() }} />
  </WorkspaceShell>
  if (!member) return <WorkspaceShell identity={identity}>
    <PageTitle title={result.data.name} description="Empresa registrada en la plataforma" />
    <div className="surface info-card">
      <dl className="details-list"><div><dt>Razón social</dt><dd>{result.data.legal_name || '—'}</dd></div>
      <div><dt>RUC</dt><dd>{result.data.tax_id || '—'}</dd></div></dl>
      <p>Las operaciones requieren una membresía activa en esta empresa.</p>
    </div>
  </WorkspaceShell>
  return <ActiveCompany key={companyId} company={result.data} identity={identity} role={member.role} />
}

function ActiveCompany({ company, identity, role }: Omit<CompanyContext, 'sync'>) {
  const sync = useRealtime(company.id)
  return <WorkspaceShell identity={identity} company={company} role={role} sync={sync}>
    <Outlet context={{ company, identity, role, sync }} />
  </WorkspaceShell>
}

export function RequireSection({ section, children }: { section: string; children: ReactNode }) {
  const { role, company } = useCompany()
  return canVisit(role, section) ? children : <Navigate to={companyHome(company.id, role)} replace />
}
export function CompanyIndex() {
  const { role, company } = useCompany()
  return <Navigate to={companyHome(company.id, role)} replace />
}

const syncText: Record<SyncStatus, string> = {
  live: 'En vivo', connecting: 'Conectando', degraded: 'Sincronización periódica', offline: 'Sin conexión',
}
export function SyncBadge({ sync }: { sync: SyncStatus }) {
  return <span className={'sync-badge sync-' + sync} role="status"><span /> {syncText[sync]}</span>
}
function SignOut() {
  const { signOut } = useSession()
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  async function logout() {
    setPending(true)
    setError(null)
    try { await signOut() } catch (cause) { setError(cause) } finally { setPending(false) }
  }
  return <div>
    <Button variant="ghost" className="sign-out" onClick={() => { void logout() }} disabled={pending}>
      <LogOut size={17} /> Cerrar sesión
    </Button>
    {Boolean(error) && <ErrorNotice error={error} />}
  </div>
}

export function WorkspaceShell({ identity, company, role, sync, children }: {
  identity: Identity; company?: Company; role?: Role; sync?: SyncStatus; children: ReactNode
}) {
  const [menu, setMenu] = useState(false)
  const display = identity.profile.full_name || identity.profile.email || 'Usuario'
  const initial = display.trim().at(0)?.toUpperCase() ?? 'U'
  const prefix = company ? '/empresas/' + company.id + '/' : ''
  return <div className="workspace">
    <a className="skip-link" href="#contenido">Ir al contenido</a>
    {menu && <button className="nav-backdrop" aria-label="Cerrar navegación" onClick={() => setMenu(false)} />}
    <aside className={'sidebar' + (menu ? ' sidebar-open' : '')}>
      <Link to="/" className="sidebar-brand" onClick={() => setMenu(false)}><Brand /></Link>
      <div className="company-block">
        <span className="company-icon"><Building2 size={19} /></span>
        <div><strong>{company?.name ?? 'Espacio de trabajo'}</strong><span>{role ? roleLabel[role] : 'Empresas'}</span></div>
      </div>
      <nav className="nav-links" aria-label="Navegación principal">
        {company && role && nav.filter((item) => canVisit(role, item.to)).map(({ to, label, icon: Icon }) =>
          <NavLink to={prefix + to} key={to} onClick={() => setMenu(false)}><Icon size={19} /> {label}</NavLink>)}
        <NavLink to="/empresas" end onClick={() => setMenu(false)}><Building2 size={19} /> Empresas</NavLink>
      </nav>
      <div className="sidebar-footer">
        <div className="profile"><span className="avatar">{initial}</span><div><strong title={display}>{display}</strong>
          <span>{role ? roleLabel[role] : identity.is_platform_admin ? 'Administrador global' : 'Mi cuenta'}</span></div></div>
        <SignOut />
      </div>
    </aside>
    <div className="workspace-body">
      <header className="topbar">
        <div className="topbar-start">
          <button className="icon-button mobile-menu" aria-label={menu ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menu} onClick={() => setMenu(!menu)}>
            {menu ? <X size={22} /> : <Menu size={22} />}
          </button>
          <span className="topbar-name"><Activity size={18} aria-hidden="true" /> {company?.name ?? 'Yape Monitor'}</span>
        </div>
        {sync && <SyncBadge sync={sync} />}
      </header>
      <main id="contenido" className="main-content">{children}</main>
    </div>
  </div>
}
