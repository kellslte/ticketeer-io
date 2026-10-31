import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { USER_REPOSITORY, type UserRepository } from '../identity/domain/user.repository.js';
import { EmailVerificationTokens } from '../identity/infrastructure/email-verification-tokens.js';
import { TICKET_REPOSITORY, type TicketRepository } from '../ticketing/domain/ticket.repository.js';
import { MAILER, type Mailer } from './mailer.js';
import { TemplateService } from './templates/template.service.js';

type Payload = Record<string, string>;

/**
 * Turns an outbox message into an email. Looks up current data at send time (names, titles), so
 * payloads stay tiny. A message whose subject has vanished (deleted ticket) is dropped, not retried.
 */
@Injectable()
export class NotificationHandler {
  private readonly logger = new Logger('Notifications');
  private readonly appUrl: string;

  constructor(
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    private readonly verification: EmailVerificationTokens,
    private readonly templates: TemplateService,
    config: ConfigService,
  ) {
    this.appUrl = config.get<string>('APP_URL') || 'http://localhost:3000';
  }

  async handle(type: string, p: Payload): Promise<void> {
    switch (type) {
      case 'user.verify_email': {
        const user = await this.users.findById(p.userId!);
        if (!user || user.emailVerifiedAt) return;
        const link = `${this.appUrl}/api/v1/auth/verify-email?token=${encodeURIComponent(this.verification.issue(user.id))}`;
        const email = this.templates.render('verify-email', {
          name: user.name,
          verifyUrl: link,
          expiresInHours: 24,
        });
        return this.mailer.send({
          to: user.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
      }
      case 'ticket.assigned': {
        const [ticket, assignee] = await Promise.all([this.tickets.findById(p.ticketId!), this.users.findById(p.assigneeId!)]);
        if (!ticket || !assignee) return;
        const ticketUrl = `${this.appUrl}/tickets/${ticket.id}`;
        const email = this.templates.render('ticket-assigned', {
          assigneeName: assignee.name,
          ticketId: ticket.id,
          ticketTitle: ticket.title,
          ticketDescription: ticket.description,
          ticketStatus: ticket.status,
          ticketUrl,
          assignedAt: new Date().toISOString(),
        });
        return this.mailer.send({
          to: assignee.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
      }
      case 'ticket.status_changed': {
        const ticket = await this.tickets.findById(p.ticketId!);
        const requester = ticket && (await this.users.findById(ticket.requesterId));
        if (!ticket || !requester) return;
        const ticketUrl = `${this.appUrl}/tickets/${ticket.id}`;
        const email = this.templates.render('ticket-status-changed', {
          requesterName: requester.name,
          ticketId: ticket.id,
          ticketTitle: ticket.title,
          fromStatus: p.from!,
          toStatus: p.to!,
          ticketUrl,
          updatedAt: new Date().toISOString(),
        });
        return this.mailer.send({
          to: requester.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
      }
      default:
        // Unknown type = deploy skew or a bug; throwing retries it and surfaces it in the error log.
        throw new Error(`No handler for outbox message type "${type}"`);
    }
  }
}
