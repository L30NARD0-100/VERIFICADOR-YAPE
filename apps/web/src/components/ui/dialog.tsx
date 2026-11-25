import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'

export function Dialog({ title, description, children, onClose }: {
  title: string; description?: string; children: ReactNode; onClose: () => void
}) {
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content className="dialog-content" {...(!description && { 'aria-describedby': undefined })}
          onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus() }}>
          <header className="dialog-header">
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            {description && <DialogPrimitive.Description>{description}</DialogPrimitive.Description>}
          </header>
          <DialogPrimitive.Close className="icon-button dialog-close" aria-label="Cerrar ventana">
            <X size={19} />
          </DialogPrimitive.Close>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
