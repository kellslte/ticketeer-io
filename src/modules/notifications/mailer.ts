import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

export const MAILER = Symbol('MAILER');

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  /** Throws on failure so the outbox retries. */
  send(mail: Mail): Promise<void>;
}

/**
 * With SMTP_HOST set, sends via that SMTP server (e.g. mailtrap-local on 127.0.0.1:3535).
 * Else, with MAILTRAP_API_TOKEN set, uses Mailtrap's HTTP send API (sandbox inbox if
 * MAILTRAP_INBOX_ID is set, otherwise live sending). With neither, mail is only logged.
 */
@Injectable()
export class MailtrapMailer implements Mailer {
  private readonly logger = new Logger('Mailer');
  private readonly token: string | undefined;
  private readonly inboxId: string | undefined;
  private readonly smtpHost: string | undefined;
  private readonly smtpPort: number;
  private readonly from: string;
  private readonly smtpTransport?: ReturnType<typeof createTransport>;

  constructor(config: ConfigService) {
    // Empty (as in .env.example) counts as unset.
    this.token = config.get<string>('MAILTRAP_API_TOKEN') || undefined;
    this.inboxId = config.get<string>('MAILTRAP_INBOX_ID') || undefined;
    this.smtpHost = config.get<string>('SMTP_HOST') || undefined;
    this.smtpPort = Number(config.get<string>('SMTP_PORT')) || 3535;
    this.from = config.get<string>('MAIL_FROM') || 'noreply@ticketeer.io';
    if (this.smtpHost) {
      this.smtpTransport = createTransport({ host: this.smtpHost, port: this.smtpPort, secure: false });
    } else if (!this.token) {
      this.logger.warn('SMTP_HOST / MAILTRAP_API_TOKEN not set: emails are logged, not sent');
    }
  }

  async send({ to, subject, text, html }: Mail): Promise<void> {
    if (this.smtpTransport) {
      await this.smtpTransport.sendMail({ from: this.from, to, subject, text, html });
      return;
    }
    if (!this.token) {
      this.logger.log(`[not sent] to=${to} subject="${subject}"\n${text}`);
      return;
    }
    const url = this.inboxId
      ? `https://sandbox.api.mailtrap.io/api/send/${this.inboxId}`
      : 'https://send.api.mailtrap.io/api/send';
    const body: Record<string, unknown> = {
      from: { email: this.from, name: 'Ticketeer' },
      to: [{ email: to }],
      subject,
      text,
    };
    if (html) body.html = html;

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Mailtrap responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}
