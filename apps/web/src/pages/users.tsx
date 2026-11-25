import { useQueryClient } from '@tanstack/react-query'
import { Pencil, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { ErrorNotice, Field, Loading, PageTitle, Select, Status } from '../components/common'
import { Table, TablePage } from '../components/data-view'
import { FormDialog, textValue } from '../components/form-dialog'
import { Button } from '../components/ui/button'
import { resourceKey, useAll, usePage } from '../hooks/data'
import { useApi } from '../hooks/session'
import { roleLabel, useCompany } from '../routes/layouts'
import { companyPath } from '../services/api'
import type { Branch, Member, Role } from '../types/api'

export function UsersPage() {
  const { company } = useCompany()
  const result = usePage<Member>(resourceKey(company.id, 'users'), companyPath(company.id) + '/users')
  const branches = useAll<Branch>(company.id, 'branches')
  const names = new Map(branches.data?.map((branch) => [branch.id, branch.name]))
  const [edit, setEdit] = useState<Member | 'new' | null>(null)
  return <>
    <PageTitle title="Usuarios" description="Gestiona el acceso, los roles y las sucursales asignadas."
      actions={<Button onClick={() => setEdit('new')}><UserPlus size={17} /> Añadir usuario</Button>} />
    <TablePage result={result} empty="No hay usuarios en esta empresa">{(rows) =>
      <Table columns={['Usuario', 'Rol', 'Sucursales', 'Estado', '']}>
        {rows.map((member) => <tr key={member.id}>
          <td><div className="table-primary">{member.full_name || member.email || 'Usuario'}</div>
            {member.full_name && <span className="table-secondary">{member.email}</span>}</td>
          <td>{roleLabel[member.role]}</td>
          <td>{member.role === 'COMPANY_ADMIN' ? 'Todas' : member.branch_ids.map((id) => names.get(id)).filter(Boolean).join(', ') || '—'}</td>
          <td><Status value={member.status} /></td>
          <td><Button variant="outline" onClick={() => setEdit(member)}><Pencil size={15} /> Editar acceso</Button></td>
        </tr>)}
      </Table>}
    </TablePage>
    {edit && <MemberDialog member={edit === 'new' ? undefined : edit} branches={branches} onClose={() => setEdit(null)} />}
  </>
}

function MemberDialog({ member, branches, onClose }: { member?: Member; branches: ReturnType<typeof useAll<Branch>>; onClose: () => void }) {
  const { company } = useCompany()
  const api = useApi()
  const client = useQueryClient()
  const [role, setRole] = useState<Role>(member?.role ?? 'CASHIER')
  const [selected, setSelected] = useState(member?.branch_ids ?? [])
  async function save(form: FormData) {
    if (role !== 'COMPANY_ADMIN' && !branches.data) throw new Error('Espera a que se carguen las sucursales.')
    const active = new Set(branches.data?.filter((branch) => branch.status === 'active').map(({ id }) => id))
    const assignment = { role, branch_ids: role === 'COMPANY_ADMIN' ? [] : selected.filter((id) => active.has(id)) }
    const path = companyPath(company.id) + '/users'
    const fullName = textValue(form, 'full_name')
    await api.json(path + (member ? '/' + member.id : ''), {
      method: member ? 'PATCH' : 'POST',
      data: member ? { ...assignment, status: textValue(form, 'status') } :
        { ...assignment, email: textValue(form, 'email'), ...(fullName && { full_name: fullName }) },
    })
    await Promise.all([
      client.invalidateQueries({ queryKey: resourceKey(company.id, 'users') }),
      client.invalidateQueries({ queryKey: ['identity'] }),
    ])
  }
  return <FormDialog title={member ? 'Editar acceso' : 'Añadir usuario'}
    description={member ? (member.email ?? undefined) : 'Si el correo es nuevo, Auth enviará una invitación.'}
    submitLabel={member ? 'Guardar cambios' : 'Añadir usuario'} onSave={save} onClose={onClose}>
    {!member && <><Field label="Correo electrónico"><input name="email" type="email" maxLength={254} required /></Field>
      <Field label="Nombre completo"><input name="full_name" maxLength={160} /></Field></>}
    <Field label="Rol"><Select value={role} onChange={(event) => setRole(event.target.value as Role)}>
      {Object.entries(roleLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </Select></Field>
    {member && <Field label="Estado"><Select name="status" defaultValue={member.status}>
      <option value="active">Activo</option><option value="inactive">Inactivo</option></Select></Field>}
    {role !== 'COMPANY_ADMIN' && <fieldset className="checkbox-group"><legend>Sucursales asignadas</legend>
      {branches.isPending && <Loading />}
      {branches.isError && <ErrorNotice error={branches.error} retry={() => { void branches.refetch() }} />}
      {branches.data?.filter((branch) => branch.status === 'active').map((branch) => <label key={branch.id}>
        <input type="checkbox" checked={selected.includes(branch.id)} onChange={(event) => setSelected((previous) =>
          event.target.checked ? [...previous, branch.id] : previous.filter((id) => id !== branch.id))} /> {branch.name}
      </label>)}
      {branches.data && !branches.data.some((branch) => branch.status === 'active') && <p>No hay sucursales activas.</p>}
    </fieldset>}
  </FormDialog>
}
