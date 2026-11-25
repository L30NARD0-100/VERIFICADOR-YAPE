import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Plus, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Empty, ErrorNotice, Field, PageTitle, Select, Status } from '../components/common'
import { DataView, Table, TablePage } from '../components/data-view'
import { FormDialog, textValue } from '../components/form-dialog'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/dialog'
import { activityKey, resourceKey, useAll, usePage } from '../hooks/data'
import { useApi } from '../hooks/session'
import { dateTime } from '../lib/format'
import { useCompany } from '../routes/layouts'
import { companyPath } from '../services/api'
import type { Branch, Device, Page, PaymentEvent } from '../types/api'

type DialogState = { type: 'create' } | { type: 'details' | 'pairing' | 'revoke'; device: Device }
const online = (device: Device) => device.status === 'active' && device.last_seen_at &&
  Date.now() - new Date(device.last_seen_at).getTime() < 5 * 60_000

export function DevicesPage() {
  const { company, role } = useCompany()
  const api = useApi()
  const client = useQueryClient()
  const path = companyPath(company.id) + '/devices'
  const key = resourceKey(company.id, 'devices')
  const result = usePage<Device>(key, path)
  const branches = useAll<Branch>(company.id, 'branches')
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const branchNames = new Map(branches.data?.map(({ id, name }) => [id, name]))
  const manage = role !== 'CASHIER'

  useEffect(() => {
    const timer = setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') void client.invalidateQueries({ queryKey: ['company', company.id, 'devices'] })
    }, 30000)
    return () => clearInterval(timer)
  }, [client, company.id])

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: activityKey(company.id) }),
    ])
  }

  return <>
    <PageTitle title="Dispositivos" description="Consulta la actividad de los equipos Android y administra su vinculación."
      actions={manage && <Button onClick={() => setDialog({ type: 'create' })}><Plus size={17} /> Registrar dispositivo</Button>} />
    <TablePage result={result} empty="No hay dispositivos registrados">{(devices) =>
      <Table columns={['Dispositivo', 'Sucursal', 'Estado', 'Última conexión', 'Versión', '']}>
        {devices.map((device) => <tr key={device.id}>
          <td><button className="table-link company-link" onClick={() => setDialog({ type: 'details', device })}>
            <Smartphone size={17} /> {device.name}</button></td>
          <td>{branchNames.get(device.branch_id) ?? '—'}</td>
          <td>{online(device) ? <span className="status status-positive">Conectado</span> :
            device.status === 'active' ? <span className="status status-muted">Sin conexión reciente</span> : <Status value={device.status} />}</td>
          <td className="nowrap">{dateTime(device.last_seen_at)}</td><td>{device.app_version || '—'}</td>
          <td><div className="row-actions">{manage && device.status !== 'active' &&
            <Button variant="outline" onClick={() => setDialog({ type: 'pairing', device })}>Vincular</Button>}
            {manage && device.status !== 'revoked' && <Button variant="ghost" onClick={() => setDialog({ type: 'revoke', device })}>Revocar</Button>}
          </div></td>
        </tr>)}
      </Table>}
    </TablePage>
    {dialog?.type === 'create' && <FormDialog title="Registrar dispositivo" onClose={() => setDialog(null)} onSave={async (form) => {
      await api.json(path, { method: 'POST', data: {
        name: textValue(form, 'name'), branch_id: textValue(form, 'branch_id'), device_identifier: textValue(form, 'device_identifier'),
      } })
      await refresh()
    }}>
      <Field label="Nombre del dispositivo"><input name="name" required maxLength={160} /></Field>
      <Field label="Identificador del dispositivo"><input name="device_identifier" required maxLength={160} placeholder="Ej. caja-centro-01" /></Field>
      <Field label="Sucursal"><Select name="branch_id" required defaultValue="">
        <option value="" disabled>Selecciona una sucursal</option>
        {branches.data?.filter((branch) => branch.status === 'active').map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </Select></Field>
      {branches.isError && <ErrorNotice error={branches.error} retry={() => { void branches.refetch() }} />}
    </FormDialog>}
    {dialog?.type === 'details' && <DeviceDetails device={dialog.device} branch={branchNames.get(dialog.device.branch_id)} onClose={() => setDialog(null)} />}
    {dialog?.type === 'pairing' && <PairingDialog device={dialog.device} onClose={() => setDialog(null)} />}
    {dialog?.type === 'revoke' && <FormDialog title="Revocar acceso" description={'Se bloqueará la credencial de ' + dialog.device.name + '.'}
      submitLabel="Revocar acceso" danger onClose={() => setDialog(null)} onSave={async () => {
        await api.json(path + '/' + dialog.device.id + '/revoke', { method: 'POST' })
        await refresh()
      }} />}
  </>
}

function DeviceDetails({ device, branch, onClose }: { device: Device; branch?: string; onClose: () => void }) {
  const { company } = useCompany()
  const api = useApi()
  const activity = useQuery({
    queryKey: [...activityKey(company.id), 'device', device.id],
    queryFn: ({ signal }) => api.json<Page<PaymentEvent>>(companyPath(company.id) + '/payment-events',
      { signal, params: { device_id: device.id, limit: 5 } }),
  })
  return <Dialog title={device.name} description={company.name} onClose={onClose}>
    <div className="dialog-form">
      <dl className="details-list">
        <div><dt>Identificador</dt><dd>{device.device_identifier}</dd></div><div><dt>Sucursal</dt><dd>{branch || '—'}</dd></div>
        <div><dt>Estado</dt><dd><Status value={device.status} /></dd></div><div><dt>Registrado</dt><dd>{dateTime(device.created_at)}</dd></div>
        <div><dt>Vinculado</dt><dd>{dateTime(device.paired_at)}</dd></div><div><dt>Última conexión</dt><dd>{dateTime(device.last_seen_at)}</dd></div>
        <div><dt>Versión</dt><dd>{device.app_version || '—'}</dd></div>
      </dl>
      <h3 className="dialog-subtitle">Actividad reciente</h3>
      <DataView result={activity}>{({ data }) => data.length ? <ul className="report-states">
        {data.map((event) => <li key={event.id}><span>{dateTime(event.received_at)}</span><Status value={event.processing_status} /></li>)}
      </ul> : <Empty title="Sin actividad reciente" />}</DataView>
    </div>
  </Dialog>
}

function PairingDialog({ device, onClose }: { device: Device; onClose: () => void }) {
  const { company } = useCompany()
  const api = useApi()
  const [pairing, setPairing] = useState<{ pairing_code: string; expires_at: string }>()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function generate() {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      setPairing(await api.json(companyPath(company.id) + '/devices/' + device.id + '/pairing', { method: 'POST' }))
    } catch (cause) { setError(cause) } finally { setBusy(false) }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(pairing!.pairing_code)
      setCopied(true)
    } catch { setError(new Error('Selecciona y copia el código manualmente.')) }
  }
  return <Dialog title="Vincular dispositivo" description={device.name + ' · código de un solo uso válido por cinco minutos.'} onClose={onClose}>
    <div className="dialog-form stack-form">
      {Boolean(error) && <ErrorNotice error={error} />}
      {pairing && <>
        <Field label="Código de vinculación"><input className="pairing-code" readOnly value={pairing.pairing_code} onFocus={(event) => event.target.select()} /></Field>
        <p>Vence el {dateTime(pairing.expires_at)} (hora de Lima).</p>
        <Button variant="outline" onClick={() => { void copy() }}><Copy size={16} /> {copied ? 'Código copiado' : 'Copiar código'}</Button>
      </>}
      <Button disabled={busy} onClick={() => { void generate() }}>{busy ? 'Generando…' : pairing ? 'Generar otro código' : 'Generar código'}</Button>
    </div>
  </Dialog>
}
