import { getRequestContext } from '../observability/context'

export interface Notification {
  level: 'info' | 'error' | 'warning'
  fn: string
  message: string
  entityId?: string
  requestId?: string
  error?: Error | unknown
  extra?: object
}

export interface NotificationChannel {
  send(notification: Notification): Promise<void>
}

class NotificationManager {
  private channels: NotificationChannel[] = []

  addChannel(channel: NotificationChannel): void {
    this.channels.push(channel)
  }

  async notify(notification: Notification): Promise<void> {
    const ctx = getRequestContext()
    const enriched: Notification = {
      ...notification,
      requestId: notification.requestId ?? ctx?.requestId,
      entityId: notification.entityId ?? ctx?.entityId,
      extra: {
        ...(notification.extra ?? {}),
        ...(ctx ? { elapsed_ms: Date.now() - ctx.startedAt } : {}),
      },
    }
    await Promise.all(this.channels.map(c => c.send(enriched)))
  }
}

export const notifier = new NotificationManager()
