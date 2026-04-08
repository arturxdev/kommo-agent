import { NotificationChannel, Notification } from '../index'

const EMOJI: Record<Notification['level'], string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
}

export class ConsoleChannel implements NotificationChannel {
  async send(n: Notification): Promise<void> {
    const reqTag = n.requestId ? ` [req:${n.requestId}]` : ''
    const prefix = `${EMOJI[n.level]} [${n.fn}]${n.entityId ? ` (${n.entityId})` : ''}${reqTag}`
    if (n.level === 'error') {
      console.error(`${prefix} ${n.message}`)
      if (n.error instanceof Error && n.error.stack) {
        const frames = n.error.stack.split('\n').slice(1, 4).map(l => `   ${l.trim()}`).join('\n')
        console.error(frames)
      }
    } else {
      console.log(`${prefix} ${n.message}`)
    }
  }
}
