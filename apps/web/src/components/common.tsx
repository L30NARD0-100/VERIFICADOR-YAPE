import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Button } from './ui/button'

export function PageTitle({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-title"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions}</header>
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return <div className="feedback" role="status"><LoaderCircle size={18} className="spin" /> {label}</div>
}
export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div className="error-notice" role="alert">
    <AlertCircle size={18} />
    <span>{error instanceof Error && error.message ? error.message : 'No se pudo completar la solicitud.'}</span>
    {retry && <Button variant="outline" onClick={retry}>Reintentar</Button>}
  </div>
}
export function Empty({ title = 'No hay registros', description }: { title?: string; description?: string }) {
  return <div className="empty"><p>{title}</p>{description && <span>{description}</span>}</div>
}
export function Select({ children, ...props }: ComponentProps<'select'>) {
  return <span className="select-wrap"><select {...props}>{children}</select><ChevronDown aria-hidden="true" size={16} /></span>
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}
export function Pagination({ page, next, previous, hasNext, busy }: {
  page: number; next: () => void; previous: () => void; hasNext: boolean; busy: boolean
}) {
  if (!hasNext && page === 1) return null
  return <div className="pagination" aria-label="Paginación">
    <span>Página {page}</span>
    <div>
      <Button variant="outline" onClick={previous} disabled={page === 1 || busy}><ChevronLeft size={16} aria-hidden="true" /> Anterior</Button>
      <Button variant="outline" onClick={next} disabled={!hasNext || busy}>Siguiente <ChevronRight size={16} aria-hidden="true" /></Button>
    </div>
  </div>
}
const statusText: Record<string, [string, string]> = {
  pending_verification: ['Pendiente de verificación', 'warning'],
  verified: ['Verificado oficialmente', 'positive'],
  processed: ['Procesado', 'info'],
  received: ['Recibido', 'info'],
  needs_review: ['Requiere revisión', 'warning'],
  rejected: ['Rechazado', 'negative'],
  processing_error: ['Error de procesamiento', 'negative'],
  active: ['Activo', 'positive'],
  inactive: ['Inactivo', 'muted'],
  pending: ['Por vincular', 'warning'],
  revoked: ['Revocado', 'negative'],
}
export function Status({ value }: { value: string }) {
  const [label, tone] = statusText[value] ?? [value, 'muted']
  return <span className={'status status-' + tone}>{label}</span>
}
