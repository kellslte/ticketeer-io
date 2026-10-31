import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const MAILER = Symbol('MAILER');

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  /** Throws on failure so the outbox retries. */
  send(mail: Mail): Promise<void>;
}

/**
 * Mailtrap's HTTP send API. With MAILTRAP_INBOX_ID it posts to the sandbox inbox (dev/staging);
 * without it, to live sending. With no MAILTRAP_API_TOKEN, mail is only logged.
 */
@Injectable()
export class MailtrapMailer implements Mailer {
  private readonly logger = new Logger('Mailer');
  private readonly token: string | undefined;
  private readonly inboxId: string | undefined;
  private readonly from: string;

  constructor(config: ConfigService) {
    // Empty (as in .env.example) counts as unset.
    this.token = config.get<string>('MAILTRAP_API_TOKEN') || undefined;
    this.inboxId = config.get<string>('MAILTRAP_INBOX_ID') || undefined;
    this.from = config.get<string>('MAIL_FROM') || 'noreply@ticketeer.io';
    if (!this.token) this.logger.warn('MAILTRAP_API_TOKEN is not set: emails are logged, not sent');
  }

  async send({ to, subject, text }: Mail): Promise<void> {
    if (!this.token) {
      this.logger.log(`[not sent] to=${to} subject="${subject}"\n${text}`);
      return;
    }
    const url = this.inboxId
      ? `https://sandbox.api.mailtrap.io/api/send/${this.inboxId}`
      : 'https://send.api.mailtrap.io/api/send';
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: { email: this.from, name: 'Ticketeer' }, to: [{ email: to }], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Mailtrap responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}
