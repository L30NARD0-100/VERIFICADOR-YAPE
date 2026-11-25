import { bearer } from '../services/auth.js'
import {
  authenticateDevice, deviceHeartbeat, ingestNotification, registerDevice, unlinkDevice,
} from '../services/devices.js'
import { deviceRegister, heartbeat, notification } from '../schemas/contracts.js'
import { body } from './request.js'
import type { Dependencies, Router } from './request.js'

export function deviceRoutes(router: Router, { pool }: Dependencies) {
  router.post('/devices/register', async (context) => {
    const input = await body(context, deviceRegister)
    return context.json(await registerDevice(pool, input), 201)
  })
  router.post('/devices/heartbeat', async (context) => {
    const input = await body(context, heartbeat)
    const device = await authenticateDevice(pool, bearer(context.req.header('Authorization')), 'heartbeat')
    return context.json(await deviceHeartbeat(pool, device, input))
  })
  router.post('/devices/unlink', async (context) => {
    const device = await authenticateDevice(pool, bearer(context.req.header('Authorization')), 'unlink')
    await unlinkDevice(pool, device)
    return context.body(null, 204)
  })
  router.post('/payments/notifications', async (context) => {
    const input = await body(context, notification)
    const device = await authenticateDevice(pool, bearer(context.req.header('Authorization')), 'notifications')
    const result = await ingestNotification(pool, device, input)
    return context.json(result, result.duplicate ? 200 : 201)
  })
}
