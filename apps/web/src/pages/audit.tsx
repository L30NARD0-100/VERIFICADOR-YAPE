import { PageTitle } from '../components/common'
import { Table, TablePage } from '../components/data-view'
import { resourceKey, usePage } from '../hooks/data'
import { dateTime } from '../lib/format'
import { useCompany } from '../routes/layouts'
import { companyPath } from '../services/api'
import type { Audit } from '../types/api'

const actions: Record<string, string> = {
  'company.created': 'Empresa creada', 'company.updated': 'Empresa actualizada',
  'branch.created': 'Sucursal creada', 'branch.updated': 'Sucursal actualizada',
  'membership.created': 'Acceso asignado', 'membership.updated': 'Acceso actualizado',
  'device.created': 'Dispositivo registrado', 'device.pairing_issued': 'Código de vinculación emitido',
  'device.paired': 'Dispositivo vinculado', 'device.revoked': 'Acceso de dispositivo revocado',
  'device.unlinked': 'Dispositivo desvinculado', 'event.received': 'Notificación recibida',
}
export function AuditPage() {
  const { company } = useCompany()
  const result = usePage<Audit>(resourceKey(company.id, 'audit'), companyPath(company.id) + '/audit-logs')
  return <>
    <PageTitle title="Actividad" description="Consulta el registro de operaciones de tu empresa." />
    <TablePage result={result} empty="Todavía no hay operaciones registradas">{(rows) => <Table columns={['Fecha y hora', 'Acción', 'Origen', 'Referencia']}>
      {rows.map((record) => <tr key={record.id}><td className="nowrap">{dateTime(record.created_at)}</td>
        <td>{actions[record.action] ?? record.action}</td>
        <td>{record.actor_type === 'user' ? 'Usuario' : record.actor_type === 'device' ? 'Dispositivo' : 'Sistema'}</td>
        <td className="reference">{record.entity_id || '—'}</td></tr>)}
    </Table>}</TablePage>
  </>
}
