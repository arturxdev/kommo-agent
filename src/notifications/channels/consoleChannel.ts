import { NotificationChannel, Notification } from '../index'

const EMOJI: Record<Notification['level'], string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
}

export class ConsoleChannel implements NotificationChannel {
  async send(n: Notification): Promise<void> {
    const prefix = `${EMOJI[n.level]} [${n.fn}]${n.entityId ? ` (${n.entityId})` : ''}`
    if (n.level === 'error') {
      console.error(`${prefix} ${n.message}`, n.error ?? '')
    } else {
      console.log(`${prefix} ${n.message}`)
    }
  }
}
