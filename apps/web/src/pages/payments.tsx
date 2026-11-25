import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Empty, ErrorNotice, Field, PageTitle, Select, Status } from '../components/common'
import { DataView, Table, TablePage } from '../components/data-view'
import { PaymentRows } from '../components/payment-table'
import { Button } from '../components/ui/button'
import { activityKey, useAll, usePage } from '../hooks/data'
import { useApi } from '../hooks/session'
import { dateTime, money } from '../lib/format'
import { useCompany } from '../routes/layouts'
import { companyPath } from '../services/api'
import type { Branch, Device, Params, Payment, PaymentDetails, PaymentEvent } from '../types/api'

export function PaymentsPage() {
  const { company } = useCompany()
  const [mode, setMode] = useState<'payments' | 'events'>('payments')
  const [params, setParams] = useState<Params>({})
  const [revision, setRevision] = useState(0)
  const branches = useAll<Branch>(company.id, 'branches')
  const devices = useAll<Device>(company.id, 'devices')

  function changeView(next: typeof mode) {
    if (next === mode) return
    setMode(next)
    setParams({})
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setParams(Object.fromEntries([...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value).trim()])))
    setRevision((previous) => previous + 1)
  }
  return <>
    <PageTitle title="Pagos e historial" description="Consulta los pagos detectados y el procesamiento de cada notificación." />
    <div className="view-switch" aria-label="Vista de historial">
      <button type="button" aria-pressed={mode === 'payments'} onClick={() => changeView('payments')}>Pagos detectados</button>
      <button type="button" aria-pressed={mode === 'events'} onClick={() => changeView('events')}>Notificaciones</button>
    </div>
    <form key={mode} className="surface filter-card" onSubmit={submit} onReset={() => { setParams({}); setRevision((value) => value + 1) }}>
      <div className="filters">
        {mode === 'payments' && <Field label="Buscar remitente"><span className="input-icon"><Search size={17} /><input name="q" placeholder="Nombre del remitente" maxLength={120} /></span></Field>}
        <Field label="Sucursal"><Select name="branch_id"><option value="">Todas las sucursales</option>
          {branches.data?.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></Field>
        <Field label="Dispositivo"><Select name="device_id"><option value="">Todos los dispositivos</option>
          {devices.data?.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</Select></Field>
        <Field label="Estado"><Select name="status"><option value="">Todos los estados</option>
          {mode === 'payments' ? <><option value="pending_verification">Pendiente de verificación</option><option value="verified">Verificado oficialmente</option></>
            : <><option value="received">Recibido</option><option value="processed">Procesado</option><option value="needs_review">Requiere revisión</option>
              <option value="rejected">Rechazado</option><option value="processing_error">Error de procesamiento</option></>}
        </Select></Field>
        <Field label="Desde"><input name="from" type="date" /></Field>
        <Field label="Hasta"><input name="to" type="date" /></Field>
        {mode === 'payments' && <Field label="Orden"><Select name="order"><option value="desc">Más recientes primero</option><option value="asc">Más antiguos primero</option></Select></Field>}
      </div>
      {(branches.isError || devices.isError) && <ErrorNotice error={branches.error ?? devices.error} retry={() => { void branches.refetch(); void devices.refetch() }} />}
      <div className="filter-actions"><Button type="reset" variant="ghost">Limpiar</Button><Button type="submit">Aplicar filtros</Button></div>
    </form>
    <HistoryRows key={mode + ':' + revision} company={company.id} mode={mode} params={params}
      branches={branches.data ?? []} devices={devices.data ?? []} />
  </>
}

function HistoryRows({ company, mode, params, branches, devices }: {
  company: string; mode: 'payments' | 'events'; params: Params; branches: Branch[]; devices: Device[]
}) {
  const result = usePage<Payment | PaymentEvent>([...activityKey(company), mode],
    companyPath(company) + (mode === 'payments' ? '/payments' : '/payment-events'), params)
  const branchNames = new Map(branches.map(({ id, name }) => [id, name]))
  const deviceNames = new Map(devices.map(({ id, name }) => [id, name]))
  return <TablePage result={result} empty="No hay resultados para estos filtros">{(rows) => mode === 'payments' ?
    <PaymentRows rows={rows as Payment[]} company={company} />
    : <Table columns={['Captura del dispositivo', 'Recepción en la API', 'Dispositivo', 'Sucursal', 'Procesamiento', 'Pago asociado']}>
      {(rows as PaymentEvent[]).map((event) => <tr key={event.id}>
        <td>{dateTime(event.captured_at)}</td><td>{dateTime(event.received_at)}</td>
        <td>{deviceNames.get(event.device_id) ?? '—'}</td><td>{branchNames.get(event.branch_id) ?? '—'}</td>
        <td><Status value={event.processing_status} /></td>
        <td>{event.payment_id ? <Link className="table-link" to={`/empresas/${company}/pagos/${event.payment_id}`}>Ver pago</Link> : '—'}</td>
      </tr>)}
    </Table>}</TablePage>
}

export function PaymentPage() {
  const { company } = useCompany()
  const { paymentId = '' } = useParams()
  const api = useApi()
  const result = useQuery({
    queryKey: [...activityKey(company.id), 'details', paymentId],
    queryFn: ({ signal }) => api.json<PaymentDetails>(companyPath(company.id) + '/payments/' + encodeURIComponent(paymentId), { signal }),
  })
  return <>
    <PageTitle title="Detalle del pago" actions={<Button asChild variant="outline"><Link to={`/empresas/${company.id}/pagos`}>Volver al historial</Link></Button>} />
    <DataView result={result}>{(payment) => <>
      <section className="surface info-card detail-payment">
        <div className="detail-top"><div><span>Importe detectado</span><h2>{money(payment.amount, payment.currency)}</h2></div><Status value={payment.status} /></div>
        <dl className="details-list">
          <div><dt>Remitente</dt><dd>{payment.sender_name || 'Sin identificar'}</dd></div>
          <div><dt>Fecha y hora</dt><dd>{dateTime(payment.received_at)}</dd></div>
          <div><dt>Método</dt><dd>{payment.payment_method === 'yape' ? 'Yape' : payment.payment_method || '—'}</dd></div>
          <div><dt>Dispositivo</dt><dd>{payment.device_name || '—'}</dd></div>
          <div><dt>Sucursal</dt><dd>{payment.branch_name || '—'}</dd></div>
          {payment.status === 'verified' && <><div><dt>Fuente oficial</dt><dd>{payment.verification_source || '—'}</dd></div>
            <div><dt>Verificado el</dt><dd>{dateTime(payment.verified_at)}</dd></div></>}
        </dl>
      </section>
      <section className="surface">
        <div className="section-heading"><h2>Eventos asociados</h2></div>
        {payment.events.length ? <Table columns={['Captura', 'Recepción', 'Procesamiento']}>
          {payment.events.map((event) => <tr key={event.id}><td>{dateTime(event.captured_at)}</td><td>{dateTime(event.received_at)}</td><td><Status value={event.processing_status} /></td></tr>)}
        </Table> : <Empty />}
      </section>
    </>}</DataView>
  </>
}
