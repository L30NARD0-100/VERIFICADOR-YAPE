import { useState, type FormEvent, type ReactNode } from 'react'
import { ErrorNotice } from './common'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'

export function FormDialog({ title, description, submitLabel = 'Guardar', danger, children, onClose, onSave }: {
  title: string; description?: string; submitLabel?: string; danger?: boolean; children?: ReactNode
  onClose: () => void; onSave: (data: FormData) => Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try { await onSave(values); onClose() }
    catch (cause) { setError(cause) }
    finally { setBusy(false) }
  }
  return <Dialog title={title} description={description} onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit} className="dialog-form stack-form">
      {Boolean(error) && <ErrorNotice error={error} />}
      {children}
      <div className="dialog-actions">
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={busy}>{busy ? 'Guardando…' : submitLabel}</Button>
      </div>
    </form>
  </Dialog>
}

export const textValue = (data: FormData, field: string) => String(data.get(field) ?? '').trim()
