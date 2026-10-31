import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { InMemoryUserRepository } from '../identity/application/identity.fakes.js';
import { User } from '../identity/domain/user.js';
import { EmailVerificationTokens } from '../identity/infrastructure/email-verification-tokens.js';
import { InMemoryTicketRepository } from '../ticketing/application/ticket.fakes.js';
import { ActorRole } from '../ticketing/domain/actor.js';
import { Ticket } from '../ticketing/domain/ticket.js';
import type { Mail, Mailer } from './mailer.js';
import { NotificationHandler } from './notification.handler.js';
import { TemplateService } from './templates/template.service.js';

class CapturingMailer implements Mailer {
  readonly sent: Mail[] = [];
  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
  }
}

describe('NotificationHandler', () => {
  const config = new ConfigService({ APP_URL: 'https://ticketeer.io' });
  const verification = new EmailVerificationTokens('test-secret-at-least-32-chars-long!');
  const templates = new TemplateService(config);

  const setup = () => {
    const mailer = new CapturingMailer();
    const users = new InMemoryUserRepository();
    const tickets = new InMemoryTicketRepository();
    const handler = new NotificationHandler(mailer, users, tickets, verification, templates, config);
    return { mailer, users, tickets, handler };
  };

  it('sends branded HTML & plaintext email for user.verify_email', async () => {
    const { mailer, users, handler } = setup();
    const user = User.register({
      id: 'u-1',
      email: 'jane@example.com',
      name: 'Jane Doe',
      passwordHash: 'hash',
    });
    await users.save(user);

    await handler.handle('user.verify_email', { userId: 'u-1' });

    expect(mailer.sent).toHaveLength(1);
    const sent = mailer.sent[0]!;
    expect(sent.to).toBe('jane@example.com');
    expect(sent.subject).toBe('Verify your email address · Ticketeer');
    expect(sent.text).toContain('Hi Jane Doe,');
    expect(sent.text).toContain('https://ticketeer.io/api/v1/auth/verify-email?token=');
    expect(sent.html).toBeDefined();
    expect(sent.html).toContain('Confirm your email address');
    expect(sent.html).toContain('Jane Doe');
    expect(sent.html).toContain('#4F46E5'); // Brand color
    expect(sent.html).toContain('Verify Email Address');
  });

  it('drops user.verify_email if user is already verified or deleted', async () => {
    const { mailer, users, handler } = setup();
    const user = User.register({
      id: 'u-1',
      email: 'jane@example.com',
      name: 'Jane Doe',
      passwordHash: 'hash',
    });
    user.verifyEmail();
    await users.save(user);

    await handler.handle('user.verify_email', { userId: 'u-1' });
    expect(mailer.sent).toHaveLength(0);

    await handler.handle('user.verify_email', { userId: 'unknown' });
    expect(mailer.sent).toHaveLength(0);
  });

  it('sends branded HTML & plaintext email for ticket.assigned', async () => {
    const { mailer, users, tickets, handler } = setup();
    const agent = User.register({
      id: 'agent-1',
      email: 'agent@ticketeer.io',
      name: 'Alex Agent',
      passwordHash: 'hash',
    });
    await users.save(agent);

    const ticket = Ticket.create(
      { id: 't-123', title: 'Cannot connect to database', description: 'Timeout error on port 5432' },
      { id: 'customer-1', role: ActorRole.CUSTOMER },
    );
    await tickets.save(ticket);

    await handler.handle('ticket.assigned', { ticketId: 't-123', assigneeId: 'agent-1' });

    expect(mailer.sent).toHaveLength(1);
    const sent = mailer.sent[0]!;
    expect(sent.to).toBe('agent@ticketeer.io');
    expect(sent.subject).toBe('[Ticket #t-123] Assigned to you: Cannot connect to database');
    expect(sent.text).toContain('Hi Alex Agent,');
    expect(sent.text).toContain('Ticket #t-123 has been assigned to you.');
    expect(sent.html).toContain('New ticket assigned to you');
    expect(sent.html).toContain('Alex Agent');
    expect(sent.html).toContain('Cannot connect to database');
    expect(sent.html).toContain('https://ticketeer.io/tickets/t-123');
  });

  it('sends branded HTML & plaintext email for ticket.status_changed', async () => {
    const { mailer, users, tickets, handler } = setup();
    const requester = User.register({
      id: 'cust-1',
      email: 'customer@example.com',
      name: 'Charlie Customer',
      passwordHash: 'hash',
    });
    await users.save(requester);

    const ticket = Ticket.create(
      { id: 't-456', title: 'Billing receipt missing', description: 'Please send latest invoice' },
      { id: 'cust-1', role: ActorRole.CUSTOMER },
    );
    await tickets.save(ticket);

    await handler.handle('ticket.status_changed', {
      ticketId: 't-456',
      from: 'in_progress',
      to: 'resolved',
    });

    expect(mailer.sent).toHaveLength(1);
    const sent = mailer.sent[0]!;
    expect(sent.to).toBe('customer@example.com');
    expect(sent.subject).toBe('[Ticket #t-456] Status updated to Resolved: Billing receipt missing');
    expect(sent.text).toContain('Hi Charlie Customer,');
    expect(sent.text).toContain('In Progress → Resolved');
    expect(sent.html).toContain('Your ticket status has been updated');
    expect(sent.html).toContain('Charlie Customer');
    expect(sent.html).toContain('Resolved');
    expect(sent.html).toContain('https://ticketeer.io/tickets/t-456');
  });

  it('throws for unknown event type so outbox retries', async () => {
    const { handler } = setup();
    await expect(handler.handle('unknown.event', {})).rejects.toThrow('No handler for outbox message type');
  });
});

