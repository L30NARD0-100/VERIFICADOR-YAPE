import { Bell, CircleCheckBig, Clock3, Radio, Smartphone, Wallet } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DataView } from '../components/data-view'
import { Empty, PageTitle, Status } from '../components/common'
import { PaymentRows } from '../components/payment-table'
import { Button } from '../components/ui/button'
import { activityKey } from '../hooks/data'
import { useApi } from '../hooks/session'
import { dateTime, money, time, todayLabel, totalEvents } from '../lib/format'
import { useCompany } from '../routes/layouts'
import { companyPath } from '../services/api'
import type { Page, Payment, PaymentEvent, Summary } from '../types/api'

function Metric({ icon, tone, label, children, footer }: {
  icon: ReactNode; tone: string; label: string; children: ReactNode; footer: string
}) {
  return <article className="surface metric">
    <span className={'metric-icon metric-' + tone}>{icon}</span>
    <p>{label}</p><strong>{children}</strong><small>{footer}</small>
  </article>
}
export function DashboardPage() {
  const { company } = useCompany()
  const api = useApi()
  const base = companyPath(company.id)
  const key = activityKey(company.id)
  const summary = useQuery({
    queryKey: [...key, 'dashboard-summary'], queryFn: ({ signal }) => api.json<Summary>(base + '/reports/daily', { signal }),
  })
  const payments = useQuery({
    queryKey: [...key, 'recent-payments'],
    queryFn: ({ signal }) => api.json<Page<Payment>>(base + '/payments', { params: { limit: 6 }, signal }),
  })
  const events = useQuery({
    queryKey: [...key, 'recent-events'],
    queryFn: ({ signal }) => api.json<Page<PaymentEvent>>(base + '/payment-events', { params: { limit: 5 }, signal }),
  })
  const links = '/empresas/' + company.id
  return <>
    <PageTitle title="Resumen de operaciones" description="Actividad de pagos y dispositivos de tu empresa."
      actions={<span className="date-chip"><Clock3 size={16} /> {todayLabel()}</span>} />
    <DataView result={summary}>{(report) => {
      const detected = report.totals_by_currency.map((row) => money(row.detected_amount, row.currency))
      const verified = report.totals_by_currency.map((row) => money(row.officially_verified_amount, row.currency))
      return <section className="metric-grid" aria-label="Indicadores del día">
        <Metric icon={<Wallet size={20} />} tone="violet" label="Importe detectado" footer="Capturas de hoy">{detected.join(' · ') || '—'}</Metric>
        <Metric icon={<Bell size={20} />} tone="blue" label="Notificaciones de hoy"
          footer={report.all_time_notifications_count
            ? BigInt(report.all_time_notifications_count).toLocaleString('es-PE') + ' recibidas en total'
            : 'Eventos recibidos en el día'}>{totalEvents(report.events_by_status)}</Metric>
        <Metric icon={<CircleCheckBig size={20} />} tone="green" label="Verificado oficialmente" footer="Importe por moneda">{verified.join(' · ') || '—'}</Metric>
        <Metric icon={<Smartphone size={20} />} tone="amber" label="Dispositivos conectados" footer="Con actividad en los últimos 5 min">
          {report.devices_online_count} <span className="metric-total">/ {report.devices_active_count}</span>
        </Metric>
      </section>
    }}</DataView>
    <div className="verification-note"><Radio size={19} /><span>Una notificación detectada requiere verificación del pago.</span></div>
    <div className="dashboard-grid">
      <section className="surface">
        <div className="section-heading"><div><h2>Pagos recientes</h2><p>Últimas notificaciones con importe detectado.</p></div>
          <Button variant="outline" asChild><Link to={links + '/pagos'}>Ver historial</Link></Button></div>
        <DataView result={payments}>{({ data }) => data.length ?
          <PaymentRows rows={data} company={company.id} compact /> :
          <Empty title="Aún no hay pagos detectados" description="Las próximas notificaciones aparecerán aquí." />}</DataView>
      </section>
      <section className="surface">
        <div className="section-heading"><div><h2>Actividad reciente</h2><p>Procesamiento de notificaciones.</p></div></div>
        <DataView result={events}>{({ data }) => data.length ? <ol className="activity-list">
          {data.map((event) => <li key={event.id}>
            <span className="event-icon"><Bell size={16} /></span>
            <div><strong>{event.payment_id ? <Link to={links + '/pagos/' + event.payment_id}>Notificación de pago</Link> : 'Notificación sin pago asociado'}</strong>
              <span>{dateTime(event.received_at)}</span></div>
            <Status value={event.processing_status} />
          </li>)}
        </ol> : <Empty title="Sin actividad reciente" />}</DataView>
      </section>
    </div>
    {summary.dataUpdatedAt > 0 && <p className="updated-at">Última consulta a la API {time(new Date(summary.dataUpdatedAt).toISOString())} · hora de Lima</p>}
  </>
}
