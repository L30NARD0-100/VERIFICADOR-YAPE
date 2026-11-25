import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'

const buttonVariants = cva('button', {
  variants: { variant: { primary: 'button-primary', outline: 'button-outline', ghost: 'button-ghost', danger: 'button-danger' } },
  defaultVariants: { variant: 'primary' },
})
type Props = ComponentProps<'button'> & {
  asChild?: boolean
  variant?: 'primary' | 'outline' | 'ghost' | 'danger'
}
export function Button({ className, variant, asChild, type, ...props }: Props) {
  const Component = asChild ? Slot : 'button'
  return <Component className={cn(buttonVariants({ variant }), className)} {...(!asChild && { type: type ?? 'button' })} {...props} />
}
