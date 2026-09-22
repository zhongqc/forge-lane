import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';

export interface NotificationMessage {
  id: string;
  to: string;
  senderName: string;
  issueKey: string;
  issueTitle: string;
  url: string;
}
// Future providers (e.g. Feishu) implement this boundary; business events stay provider independent.
export interface NotificationChannel {
  configured(): boolean;
  send(message: NotificationMessage): Promise<void>;
}
@Injectable()
export class EmailChannel implements NotificationChannel {
  configured() {
    try {
      const appUrl = new URL(process.env.APP_URL || '');
      return Boolean(
        process.env.SMTP_HOST && process.env.SMTP_FROM && ['http:', 'https:'].includes(appUrl.protocol),
      );
    } catch {
      return false;
    }
  }
  async send(message: NotificationMessage) {
    if (!this.configured()) throw new Error('EMAIL_NOT_CONFIGURED');
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      requireTLS: process.env.SMTP_SECURE !== 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: message.to,
        messageId: `<forge-mention-${message.id}@notifications.forge-lane>`,
        subject: `[${message.issueKey}] ${message.senderName.replace(/[\r\n]/g, ' ')} 提及了你`,
        text: `${message.senderName} 在 ${message.issueKey} ${message.issueTitle} 中提及了你。\n\n${message.url}`,
      });
    } finally {
      transport.close();
    }
  }
}
