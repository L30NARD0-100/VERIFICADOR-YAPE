import { z } from 'zod'

const http = z.url({ protocol: /^https?$/ })
const database = z.url({ protocol: /^(postgres|postgresql)$/ })
const services = z.object({
  DATABASE_URL: database,
  SUPABASE_URL: http,
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  FRONTEND_URL: http,
})

export function loadEnvironment(environment: NodeJS.ProcessEnv) {
  const port = z.coerce.number().int().min(1).max(65535).parse(environment.PORT ?? '3000')
  const configured = Boolean(environment.DATABASE_URL || environment.SUPABASE_URL ||
    environment.SUPABASE_ANON_KEY || environment.SUPABASE_SERVICE_ROLE_KEY)
  if (!configured && environment.NODE_ENV !== 'production') return { port, services: undefined }
  const parsed = services.safeParse(environment)
  if (!parsed.success) {
    const names = parsed.error.issues.map(({ path }) => path.join('.')).join(', ')
    throw new Error('Configuración de API incompleta o inválida: ' + names)
  }
  if (environment.NODE_ENV === 'production' &&
    [parsed.data.SUPABASE_URL, parsed.data.FRONTEND_URL].some((url) => new URL(url).protocol !== 'https:')) {
    throw new Error('SUPABASE_URL y FRONTEND_URL deben usar HTTPS en producción.')
  }
  return { port, services: parsed.data }
}
