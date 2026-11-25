import { Download } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Empty, ErrorNotice, Field, PageTitle, Select, Status } from '../components/common'
import { DataView, Table } from '../components/data-view'
import { Button } from '../components/ui/button'
import { activityKey, useAll } from '../hooks/data'
import { useApi } from '../hooks/session'
import { dateRange, money, totalEvents } from '../lib/format'
import { useCompany } from '../routes/layouts'
import { companyPath } from '../services/api'
import type { Branch, Device, Summary } from '../types/api'

export function ReportsPage() {
  const { company, role } = useCompany()
  const api = useApi()
  const route = companyPath(company.id) + '/reports/'
  const [range, setRange] = useState(() => ({ ...dateRange(1), branch_id: '', device_id: '' }))
  const [draft, setDraft] = useState(range)
  const [period, setPeriod] = useState('1')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const branches = useAll<Branch>(company.id, 'branches')
  const devices = useAll<Device>(company.id, 'devices')
  const report = useQuery({
    queryKey: [...activityKey(company.id), 'report', range],
    queryFn: ({ signal }) => api.json<Summary>(route + 'summary', { signal, params: range }),
  })
  function edit(key: keyof typeof draft, value: string) {
    if (key === 'from' || key === 'to') setPeriod('custom')
    setDraft((previous) => ({ ...previous, [key]: value, ...(key === 'branch_id' && { device_id: '' }) }))
  }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRange(draft)
    setError(null)
  }
  async function download() {
    setExporting(true)
    setError(null)
    try {
      const response = await api.request(route + 'export.csv', { params: range })
      const link = document.createElement('a')
      const url = URL.createObjectURL(await response.blob())
      link.href = url
      link.download = 'yape-monitor-pagos.csv'
      document.body.append(link)
      link.click()
      link.remove()
      const release = URL.revokeObjectURL.bind(URL)
      setTimeout(() => release(url), 1000)
    } catch (cause) { setError(cause) } finally { setExporting(false) }
  }
  return <>
    <PageTitle title="Reportes" description="Consulta los importes detectados y verificados por período."
      actions={role !== 'CASHIER' && <Button variant="outline" disabled={exporting || report.isError || report.isPending}
        onClick={() => { void download() }}><Download size={17} /> {exporting ? 'Exportando…' : 'Exportar CSV'}</Button>} />
    {Boolean(error) && <ErrorNotice error={error} />}
    <form className="surface filter-card" onSubmit={apply}>
      <div className="filters">
        <Field label="Período"><Select value={period} onChange={(event) => {
          const value = event.target.value
          setPeriod(value)
          if (value !== 'custom') setDraft((previous) => ({ ...previous, ...dateRange(Number(value)) }))
        }}><option value="1">Hoy</option><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option>
          <option value="custom">Rango personalizado</option></Select></Field>
        <Field label="Desde"><input type="date" required value={draft.from} max={draft.to} onChange={(event) => edit('from', event.target.value)} /></Field>
        <Field label="Hasta"><input type="date" required value={draft.to} min={draft.from} onChange={(event) => edit('to', event.target.value)} /></Field>
        <Field label="Sucursal"><Select value={draft.branch_id} onChange={(event) => edit('branch_id', event.target.value)}>
          <option value="">Todas las sucursales</option>{branches.data?.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </Select></Field>
        <Field label="Dispositivo"><Select value={draft.device_id} onChange={(event) => edit('device_id', event.target.value)}>
          <option value="">Todos los dispositivos</option>{devices.data?.filter((device) => !draft.branch_id || device.branch_id === draft.branch_id)
            .map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</Select></Field>
      </div>
      {(branches.isError || devices.isError) && <ErrorNotice error={branches.error ?? devices.error} retry={() => { void branches.refetch(); void devices.refetch() }} />}
      <div className="filter-actions"><Button type="submit">Aplicar período</Button></div>
    </form>
    <DataView result={report}>{(data) => <>
      <section className="surface">
        <div className="section-heading"><div><h2>Totales por moneda</h2><p>{data.from} al {data.to} · hora de Lima</p></div></div>
        {data.totals_by_currency.length ? <Table columns={['Moneda', 'Pagos detectados', 'Importe detectado', 'Pagos verificados', 'Importe verificado']}>
          {data.totals_by_currency.map((row) => <tr key={row.currency ?? 'unknown'}>
            <td>{row.currency ?? 'Sin moneda'}</td><td>{row.detected_count}</td><td className="amount">{money(row.detected_amount, row.currency)}</td>
            <td>{row.officially_verified_count}</td><td className="amount">{money(row.officially_verified_amount, row.currency)}</td>
          </tr>)}</Table> : <Empty title="Sin pagos en el período" />}
      </section>
      <section className="surface info-card"><h2>Notificaciones · {totalEvents(data.events_by_status)}</h2>
        {Object.keys(data.events_by_status).length ? <ul className="report-states">
          {Object.entries(data.events_by_status).map(([status, count]) => <li key={status}><Status value={status} /><strong>{count}</strong></li>)}
        </ul> : <Empty title="Sin eventos en el período" />}
      </section>
    </>}</DataView>
  </>
}
