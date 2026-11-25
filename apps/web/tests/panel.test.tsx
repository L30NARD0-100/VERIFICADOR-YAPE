import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Role } from '../src/types/api'

const sdk = vi.hoisted(() => {
  const auth = {
    callback: undefined as undefined | ((event: string, session: unknown) => void),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
  }
  const channels: { emit?: () => void; status?: (value: string) => void; filters: unknown[] }[] = []
  const removeChannel = vi.fn()
  return { auth, channels, removeChannel }
})

vi.mock('../src/lib/supabase', () => ({
  apiUrl: 'https://api.example.test',
  passwordLink: false,
  authLinkError: false,
  supabase: {
    auth: sdk.auth,
    removeChannel: sdk.removeChannel,
    channel() {
      const channel: typeof sdk.channels[number] = { filters: [] }
      sdk.channels.push(channel)
      const chain = {
        on(_event: string, filter: unknown, emit: () => void) {
          channel.emit = emit
          channel.filters.push(filter)
          return chain
        },
        subscribe(status: (value: string) => void) {
          channel.status = status
          return chain
        },
      }
      return chain
    },
  },
}))
import { App } from '../src/routes/app'

const company = { id: 'fb27e583-e099-4bed-b1a0-ef50b37fe982', name: 'Mercado Central', legal_name: null, tax_id: null, status: 'active' }
const profile = { id: '8f391af4-5d0f-4fa9-b25c-12766cecbe79', email: 'caja@example.test', full_name: 'Ana', status: 'active' }
const session = { user: { id: profile.id }, access_token: 'access-token' }
const branch = { id: 'centro', name: 'Tienda Centro', status: 'active' }
const payment = {
  id: 'pago-uno', sender_name: 'María Rivera', amount: '18.50', currency: 'PEN', received_at: '2026-11-25T15:30:00Z',
  payment_method: 'yape', branch_name: branch.name, device_name: 'Caja Uno', status: 'pending_verification',
}
let identityRole: Role
let signedIn: typeof session | null
let payments: (typeof payment)[]
let branches: (typeof branch)[]
let device: { id: string; branch_id: string; name: string; status: string } | null
const network = vi.fn()

beforeEach(() => {
  identityRole = 'CASHIER'
  signedIn = null
  payments = [payment]
  branches = [branch]
  device = null
  sdk.channels.length = 0
  sdk.auth.callback = undefined
  vi.clearAllMocks()
  sdk.auth.getSession.mockImplementation(async () => ({ data: { session: signedIn }, error: null }))
  sdk.auth.onAuthStateChange.mockImplementation((callback) => {
    sdk.auth.callback = callback
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  sdk.auth.signInWithPassword.mockImplementation(async () => {
    sdk.auth.callback?.('SIGNED_IN', session)
    return { data: { session }, error: null }
  })
  sdk.auth.signOut.mockImplementation(async () => {
    sdk.auth.callback?.('SIGNED_OUT', null)
    return { error: null }
  })
  sdk.auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  sdk.auth.updateUser.mockResolvedValue({ error: null })
  network.mockImplementation(async (input: string, options?: RequestInit) => {
    const { pathname, searchParams } = new URL(input)
    if (pathname === '/api/me') return Response.json({
      profile, is_platform_admin: false, memberships: [{ id: 'membership', company_id: company.id, role: identityRole, status: 'active' }],
    })
    if (pathname === '/api/companies') return Response.json({ data: [company], next_cursor: null })
    if (pathname.endsWith('/' + company.id)) return Response.json(company)
    if (pathname.endsWith('/branches') && options?.method === 'POST') {
      const added = { id: 'otra', status: 'active', ...JSON.parse(String(options.body)) }
      branches.push(added)
      return Response.json(added, { status: 201 })
    }
    if (pathname.endsWith('/branches')) return Response.json({ data: branches, next_cursor: null })
    if (pathname.endsWith('/devices') && options?.method === 'POST') {
      const body = JSON.parse(String(options.body))
      device = { id: 'phone-one', name: body.name, branch_id: body.branch_id, status: 'pending' }
      return Response.json(device, { status: 201 })
    }
    if (pathname.endsWith('/devices')) return Response.json({ data: device ? [device] : [], next_cursor: null })
    if (pathname.endsWith('/pairing')) return Response.json({ pairing_code: 'TEMPORARY-CODE', expires_at: '2026-11-25T17:00:00Z' })
    if (pathname.endsWith('/payment-events')) return Response.json({ data: [], next_cursor: null })
    if (pathname.endsWith('/payments')) {
      const name = searchParams.get('q') ?? ''
      const rows = payments.filter((row) => row.sender_name.toLowerCase().includes(name.toLowerCase()))
      return Response.json({ data: rows, next_cursor: null })
    }
    if (pathname.endsWith('/payments/' + payment.id)) return Response.json({ ...payment, events: [] })
    if (pathname.endsWith('/reports/export.csv')) return new Response('id,amount', { headers: { 'Content-Type': 'text/csv' } })
    if (pathname.includes('/reports/')) return Response.json({
      from: '2026-11-25', to: '2026-11-25', timezone: 'America/Lima', events_by_status: { processed: '1' },
      totals_by_currency: [{ currency: 'PEN', detected_count: '1', detected_amount: '18.50',
        officially_verified_count: '0', officially_verified_amount: '0' }], devices_online_count: '1', devices_active_count: '2',
    })
    return Response.json({ error: { message: 'Ruta de prueba inesperada' } }, { status: 404 })
  })
  vi.stubGlobal('fetch', network)
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/') })

const companyPath = (section: string) => '/empresas/' + company.id + '/' + section

function open(path: string) {
  window.history.replaceState({}, '', path)
  render(<App />)
  return userEvent.setup()
}

describe('sesión y permisos', () => {
  it('protege rutas, entra por rol y elimina los datos visibles al salir', async () => {
    const user = open(companyPath('pagos'))
    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    await user.type(screen.getByLabelText('Correo electrónico'), 'caja@example.test')
    await user.type(screen.getByLabelText('Contraseña', { exact: true }), 'mi-clave-privada')
    await user.click(screen.getByRole('button', { name: 'Entrar al panel' }))
    await screen.findByRole('heading', { name: 'Pagos e historial' })
    await screen.findByText('María Rivera')
    expect(sdk.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'caja@example.test', password: 'mi-clave-privada' })
    expect(screen.queryByRole('link', { name: 'Usuarios' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    await screen.findByRole('heading', { name: 'Iniciar sesión' })
    expect(screen.queryByText('María Rivera')).toBeNull()
  })

  it('redirige el acceso directo a usuarios para un cajero', async () => {
    signedIn = session
    open(companyPath('usuarios'))
    await screen.findByRole('heading', { name: 'Pagos e historial' })
    expect(network.mock.calls.some(([url]) => String(url).endsWith('/users'))).toBe(false)
  })

  it('envía recuperación y acepta el evento de Supabase para restablecer la clave', async () => {
    const user = open('/recuperar')
    await user.type(await screen.findByLabelText('Correo electrónico'), 'caja@example.test')
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    await screen.findByText(/Si la cuenta existe/)
    expect(sdk.auth.resetPasswordForEmail).toHaveBeenCalledWith('caja@example.test',
      { redirectTo: window.location.origin + '/restablecer' })
    act(() => sdk.auth.callback?.('PASSWORD_RECOVERY', session))
    await user.type(await screen.findByLabelText('Nueva contraseña'), 'nueva-clave-segura')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'nueva-clave-segura')
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    await screen.findByRole('heading', { name: 'Pagos e historial' })
    expect(sdk.auth.updateUser).toHaveBeenCalledWith({ password: 'nueva-clave-segura' })
  })
})

describe('pagos y Realtime', () => {
  it('filtra, muestra estados y abre detalle de pago', async () => {
    signedIn = session
    const user = open(companyPath('pagos'))
    await screen.findByText('Pendiente de verificación')
    fireEvent.change(screen.getByLabelText('Buscar remitente'), { target: { value: 'Otro nombre' } })
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    await screen.findByText('No hay resultados para estos filtros')
    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    await user.click(await screen.findByRole('link', { name: 'María Rivera' }))
    await screen.findByRole('heading', { name: 'Detalle del pago' })
    await waitFor(() => expect(screen.getByText('Pendiente de verificación')).toBeTruthy())
  })

  it('suscribe ambas tablas al ámbito real y recupera eventos tras desconexión', async () => {
    signedIn = session
    open(companyPath('pagos'))
    await screen.findByRole('link', { name: 'María Rivera' })
    const first = sdk.channels.at(-1)!
    expect(first.filters).toEqual([
      { event: '*', schema: 'public', table: 'payments', filter: 'company_id=eq.' + company.id },
      { event: '*', schema: 'public', table: 'payment_events', filter: 'company_id=eq.' + company.id },
    ])
    act(() => first.status?.('SUBSCRIBED'))
    await screen.findByText('En vivo')
    payments = [...payments, { ...payment, id: 'nuevo', sender_name: 'Rosa' }]
    act(() => first.emit?.())
    await screen.findByRole('link', { name: 'Rosa' })
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    act(() => window.dispatchEvent(new Event('offline')))
    await screen.findByText('Sin conexión')
    payments = [...payments, { ...payment, id: 'offline', sender_name: 'César' }]
    expect(screen.queryByRole('link', { name: 'César' })).toBeNull()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    act(() => window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(sdk.channels.at(-1)).not.toBe(first))
    act(() => sdk.channels.at(-1)?.status?.('SUBSCRIBED'))
    await screen.findByRole('link', { name: 'César' })
    expect(sdk.removeChannel).toHaveBeenCalled()
  })
})

describe('administración', () => {
  it('muestra métricas diferenciadas y registra y vincula un dispositivo', async () => {
    identityRole = 'COMPANY_ADMIN'
    signedIn = session
    const user = open('/')
    await screen.findByRole('heading', { name: 'Resumen de operaciones' })
    await screen.findByText('Verificado oficialmente')
    expect(screen.getByText('Dispositivos conectados')).toBeTruthy()
    await user.click(screen.getByRole('link', { name: 'Dispositivos' }))
    await user.click(await screen.findByRole('button', { name: 'Registrar dispositivo' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Nombre del dispositivo'), 'Android Centro')
    await user.type(within(dialog).getByLabelText('Identificador del dispositivo'), 'android-centro')
    await user.selectOptions(within(dialog).getByLabelText('Sucursal'), 'centro')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await screen.findByRole('button', { name: 'Android Centro' })
    await user.click(screen.getByRole('button', { name: 'Vincular' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Generar código' }))
    expect(await screen.findByDisplayValue('TEMPORARY-CODE')).toBeTruthy()
  })
})

describe('sucursales y reportes', () => {
  it('crea una sucursal desde el panel administrativo', async () => {
    signedIn = session
    identityRole = 'COMPANY_ADMIN'
    const user = open(companyPath('sucursales'))
    await user.click(await screen.findByRole('button', { name: 'Nueva sucursal' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Nombre de la sucursal'), 'Tienda Lima Norte')
    await user.type(within(dialog).getByLabelText('Dirección'), 'Av. Lima 100')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await screen.findByText('Tienda Lima Norte')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('exporta el período y la sucursal aplicados por un gerente', async () => {
    signedIn = session
    identityRole = 'MANAGER'
    const createUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const revokeUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:csv') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    try {
      const user = open(companyPath('reportes'))
      await screen.findByRole('heading', { name: 'Totales por moneda' })
      await waitFor(() => expect(screen.getByRole('option', { name: 'Tienda Centro' })).toBeTruthy())
      await user.selectOptions(screen.getByLabelText('Período'), '7')
      await user.selectOptions(screen.getByLabelText('Sucursal'), 'centro')
      await user.click(screen.getByRole('button', { name: 'Aplicar período' }))
      await waitFor(() => expect((screen.getByRole('button', { name: 'Exportar CSV' }) as HTMLButtonElement).disabled).toBe(false))
      await user.click(screen.getByRole('button', { name: 'Exportar CSV' }))
      await waitFor(() => expect(download).toHaveBeenCalledOnce())
      const request = network.mock.calls.map(([url]) => new URL(String(url))).find(({ pathname }) => pathname.endsWith('/export.csv'))
      expect(request?.searchParams.get('branch_id')).toBe('centro')
      const from = Date.parse(request?.searchParams.get('from') ?? '')
      const to = Date.parse(request?.searchParams.get('to') ?? '')
      expect((to - from) / 86_400_000).toBe(6)
    } finally {
      if (createUrl) Object.defineProperty(URL, 'createObjectURL', createUrl)
      else Reflect.deleteProperty(URL, 'createObjectURL')
      if (revokeUrl) Object.defineProperty(URL, 'revokeObjectURL', revokeUrl)
      else Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
  })
})
