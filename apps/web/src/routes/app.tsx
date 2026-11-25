import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Loading } from '../components/common'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SessionProvider, useSession } from '../hooks/session'
import { AuthPage } from '../pages/auth'
import { ApiError } from '../services/api'
import { CompanyIndex, CompanyLayout, Home, RequireSection, RequireSession } from './layouts'

const AuditPage = lazy(() => import('../pages/audit').then((page) => ({ default: page.AuditPage })))
const BranchesPage = lazy(() => import('../pages/branches').then((page) => ({ default: page.BranchesPage })))
const CompaniesPage = lazy(() => import('../pages/companies').then((page) => ({ default: page.CompaniesPage })))
const DashboardPage = lazy(() => import('../pages/dashboard').then((page) => ({ default: page.DashboardPage })))
const DevicesPage = lazy(() => import('../pages/devices').then((page) => ({ default: page.DevicesPage })))
const PaymentPage = lazy(() => import('../pages/payments').then((page) => ({ default: page.PaymentPage })))
const PaymentsPage = lazy(() => import('../pages/payments').then((page) => ({ default: page.PaymentsPage })))
const ReportsPage = lazy(() => import('../pages/reports').then((page) => ({ default: page.ReportsPage })))
const UsersPage = lazy(() => import('../pages/users').then((page) => ({ default: page.UsersPage })))

function Cache({ children }: { children: ReactNode }) {
  const [cache] = useState(() => new QueryClient({ defaultOptions: { queries: {
    staleTime: 15_000,
    retry: (failures, error) => failures < 1 && (!(error instanceof ApiError) || error.status >= 500),
  } } }))
  return <QueryClientProvider client={cache}>{children}</QueryClientProvider>
}

function ApplicationRoutes() {
  const { session } = useSession()
  return <Cache key={session?.user.id ?? 'anonymous'}>
    <Suspense fallback={<div className="center-screen"><Loading label="Cargando panel…" /></div>}>
      <Routes>
        <Route path="/login" element={<AuthPage key="login" mode="login" />} />
        <Route path="/recuperar" element={<AuthPage key="forgot" mode="forgot" />} />
        <Route path="/restablecer" element={<AuthPage key="reset" mode="reset" />} />
        <Route element={<RequireSession />}>
          <Route index element={<Home />} />
          <Route path="/empresas" element={<CompaniesPage />} />
          <Route path="/empresas/:companyId" element={<CompanyLayout />}>
            <Route index element={<CompanyIndex />} />
            <Route path="resumen" element={<DashboardPage />} />
            <Route path="pagos" element={<PaymentsPage />} />
            <Route path="pagos/:paymentId" element={<PaymentPage />} />
            <Route path="reportes" element={<ReportsPage />} />
            <Route path="sucursales" element={<BranchesPage />} />
            <Route path="dispositivos" element={<DevicesPage />} />
            <Route path="usuarios" element={<RequireSection section="usuarios"><UsersPage /></RequireSection>} />
            <Route path="actividad" element={<RequireSection section="actividad"><AuditPage /></RequireSection>} />
            <Route path="*" element={<CompanyIndex />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  </Cache>
}
export function App() {
  return <BrowserRouter><SessionProvider><ApplicationRoutes /></SessionProvider></BrowserRouter>
}
