import { Link } from 'react-router-dom'
import { dateTime, money } from '../lib/format'
import type { Payment } from '../types/api'
import { Status } from './common'
import { Table } from './data-view'

export function PaymentRows({ rows, company, compact = false }: { rows: Payment[]; company: string; compact?: boolean }) {
  const columns = compact ? ['Remitente', 'Fecha y hora', 'Importe detectado', 'Estado'] :
    ['Remitente', 'Fecha y hora', 'Importe detectado', 'Método', 'Dispositivo', 'Sucursal', 'Estado']
  return <Table columns={columns}>
    {rows.map((row) => <tr key={row.id}>
      <td><Link className="table-link" to={`/empresas/${company}/pagos/${row.id}`}>{row.sender_name || 'Remitente sin identificar'}</Link></td>
      <td className="nowrap">{dateTime(row.received_at)}</td>
      <td className="amount nowrap">{money(row.amount, row.currency)}</td>
      {!compact && <><td>{row.payment_method === 'yape' ? 'Yape' : row.payment_method || '—'}</td>
        <td>{row.device_name || '—'}</td><td>{row.branch_name || '—'}</td></>}
      <td><Status value={row.status} /></td>
    </tr>)}
  </Table>
}
