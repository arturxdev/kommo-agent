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
    await Promise.all(this.channels.map(c => c.send(notification)))
  }
}

export const notifier = new NotificationManager()
