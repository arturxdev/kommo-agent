import { NotificationChannel, Notification } from '../index'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
    }),
  ],
})

export class FileChannel implements NotificationChannel {
  async send(n: Notification): Promise<void> {
    logger.log({
      level: n.level === 'warning' ? 'warn' : n.level,
      fn: n.fn,
      entityId: n.entityId,
      message: n.message,
      error: n.error instanceof Error ? n.error.message : n.error,
      extra: n.extra,
    })
  }
}
