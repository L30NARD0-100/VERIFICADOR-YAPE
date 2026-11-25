import { useQueryClient } from '@tanstack/react-query'
import { Building2, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Field, PageTitle, Status } from '../components/common'
import { Table, TablePage } from '../components/data-view'
import { FormDialog, textValue } from '../components/form-dialog'
import { Button } from '../components/ui/button'
import { usePage } from '../hooks/data'
import { useApi } from '../hooks/session'
import { companyHome, roleLabel, useIdentity, WorkspaceShell } from '../routes/layouts'
import { companyPath } from '../services/api'
import type { Company } from '../types/api'

export function CompaniesPage() {
  const identity = useIdentity()
  const api = useApi()
  const client = useQueryClient()
  const result = usePage<Company>(['companies'], '/companies')
  const [edit, setEdit] = useState<Company | 'new' | null>(null)
  const [firstAdmin, setFirstAdmin] = useState('')
  function openNew() { setFirstAdmin(''); setEdit('new') }
  const existing = edit && edit !== 'new' ? edit : undefined

  async function save(form: FormData) {
    const values = { name: textValue(form, 'name'), legal_name: textValue(form, 'legal_name') || null, tax_id: textValue(form, 'tax_id') || null }
    if (existing) {
      await api.json(companyPath(existing.id), { method: 'PATCH', data: values })
      await client.invalidateQueries({ queryKey: ['company', existing.id, 'details'] })
    } else {
      await api.json('/companies', { method: 'POST', data: { ...values, admin_profile_id: firstAdmin.trim() } })
      await client.invalidateQueries({ queryKey: ['identity'] })
    }
    await client.invalidateQueries({ queryKey: ['companies'] })
  }

  return <WorkspaceShell identity={identity}>
    <PageTitle title="Empresas" description="Selecciona un negocio para abrir su espacio de trabajo."
      actions={identity.is_platform_admin && <Button onClick={openNew}><Plus size={17} /> Nueva empresa</Button>} />
    <TablePage result={result} empty="No tienes empresas asignadas">{(companies) =>
      <Table columns={['Empresa', 'Razón social', 'RUC', 'Rol', 'Estado', '']}>
        {companies.map((company) => {
          const member = identity.memberships.find((item) => item.company_id === company.id && item.status === 'active')
          return <tr key={company.id}>
            <td><Link className="table-link company-link" to={member ? companyHome(company.id, member.role) : '/empresas/' + company.id}>
              <Building2 size={17} /> {company.name}</Link></td>
            <td>{company.legal_name || '—'}</td><td>{company.tax_id || '—'}</td>
            <td>{member ? roleLabel[member.role] : 'Acceso global'}</td><td><Status value={company.status} /></td>
            <td>{member?.role === 'COMPANY_ADMIN' && <Button variant="outline" onClick={() => setEdit(company)}><Pencil size={15} /> Editar empresa</Button>}</td>
          </tr>
        })}
      </Table>}
    </TablePage>
    {edit && <FormDialog title={existing ? 'Editar empresa' : 'Nueva empresa'} onClose={() => setEdit(null)} onSave={save}>
      <Field label="Nombre comercial"><input name="name" defaultValue={existing?.name} maxLength={160} required /></Field>
      <Field label="Razón social"><input name="legal_name" defaultValue={existing?.legal_name ?? ''} maxLength={240} /></Field>
      <Field label="RUC"><input name="tax_id" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} defaultValue={existing?.tax_id ?? ''} /></Field>
      {!existing && <>
        <Field label="UUID del administrador inicial"><input name="admin_profile_id" value={firstAdmin} required maxLength={36}
          placeholder="UUID de un perfil activo" onChange={(event) => setFirstAdmin(event.target.value)} /></Field>
        <Button variant="outline" onClick={() => setFirstAdmin(identity.profile.id)}>Usar mi perfil</Button>
      </>}
    </FormDialog>}
  </WorkspaceShell>
}
