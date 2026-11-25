import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Field, PageTitle, Select, Status } from '../components/common'
import { Table, TablePage } from '../components/data-view'
import { FormDialog, textValue } from '../components/form-dialog'
import { Button } from '../components/ui/button'
import { usePage, resourceKey, activityKey } from '../hooks/data'
import { useApi } from '../hooks/session'
import { useCompany } from '../routes/layouts'
import { companyPath } from '../services/api'
import type { Branch } from '../types/api'

export function BranchesPage() {
  const { company, role } = useCompany()
  const api = useApi()
  const client = useQueryClient()
  const path = companyPath(company.id) + '/branches'
  const key = resourceKey(company.id, 'branches')
  const result = usePage<Branch>(key, path)
  const [edit, setEdit] = useState<Branch | 'new' | null>(null)
  const existing = edit && edit !== 'new' ? edit : undefined
  async function save(form: FormData) {
    await api.json(path + (existing ? '/' + existing.id : ''), {
      method: existing ? 'PATCH' : 'POST',
      data: {
        name: textValue(form, 'name'), address: textValue(form, 'address') || null,
        ...(existing && role === 'COMPANY_ADMIN' && { status: textValue(form, 'status') }),
      },
    })
    await Promise.all([
      client.invalidateQueries({ queryKey: key }),
      client.invalidateQueries({ queryKey: activityKey(company.id) }),
    ])
  }
  return <>
    <PageTitle title="Sucursales" description="Gestiona los puntos de cobro y su estado."
      actions={role === 'COMPANY_ADMIN' && <Button onClick={() => setEdit('new')}><Plus size={17} /> Nueva sucursal</Button>} />
    <TablePage result={result} empty="No hay sucursales visibles">{(rows) => <Table columns={['Sucursal', 'Dirección', 'Estado', '']}>
      {rows.map((branch) => <tr key={branch.id}><td className="cell-strong">{branch.name}</td>
        <td>{branch.address || '—'}</td><td><Status value={branch.status} /></td>
        <td>{role !== 'CASHIER' && <Button variant="outline" onClick={() => setEdit(branch)}><Pencil size={15} /> Editar</Button>}</td></tr>)}
    </Table>}</TablePage>
    {edit && <FormDialog title={existing ? 'Editar sucursal' : 'Nueva sucursal'} onClose={() => setEdit(null)} onSave={save}>
      <Field label="Nombre de la sucursal"><input name="name" defaultValue={existing?.name} required maxLength={160} /></Field>
      <Field label="Dirección"><input name="address" defaultValue={existing?.address ?? ''} maxLength={300} /></Field>
      {existing && role === 'COMPANY_ADMIN' && <Field label="Estado"><Select name="status" defaultValue={existing.status}>
        <option value="active">Activa</option><option value="inactive">Inactiva</option></Select></Field>}
    </FormDialog>}
  </>
}
