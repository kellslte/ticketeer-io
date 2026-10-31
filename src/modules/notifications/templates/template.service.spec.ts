import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { TemplateService } from './template.service.js';

describe('TemplateService', () => {
  const config = new ConfigService({ APP_URL: 'https://ticketeer.io' });
  const service = new TemplateService(config);

  describe('Handlebars parsing (default)', () => {
    it('renders verify-email template with brand layout, token link, and expiration', () => {
      const result = service.render('verify-email', {
        name: 'Jane Doe',
        verifyUrl: 'https://ticketeer.io/verify?token=abc-123',
        expiresInHours: 24,
      });

      expect(result.subject).toBe('Verify your email');
      expect(result.html).toContain('Jane Doe');
      expect(result.html).toContain('https://ticketeer.io/verify?token=abc-123');
      expect(result.html).toContain('24 hours');
      expect(result.html).toContain('Ticketeer');
      // Contains brand styles and logo
      expect(result.html).toContain('#4F46E5');
      // Plain text check
      expect(result.text).toContain('Hi Jane Doe,');
      expect(result.text).toContain('https://ticketeer.io/verify?token=abc-123');
    });

    it('renders ticket-assigned template with status badge and metadata', () => {
      const result = service.render('ticket-assigned', {
        assigneeName: 'Alex Rivera',
        ticketId: 't-992',
        ticketTitle: 'Database Connection Pool Exhausted',
        ticketDescription: 'Services in us-east are reporting timeouts.',
        ticketStatus: 'in_progress',
        ticketUrl: 'https://ticketeer.io/tickets/t-992',
        assignedAt: '2026-10-31T07:00:00Z',
      });

      expect(result.subject).toBe('[Ticket #t-992] Assigned to you: Database Connection Pool Exhausted');
      expect(result.html).toContain('Alex Rivera');
      expect(result.html).toContain('Database Connection Pool Exhausted');
      expect(result.html).toContain('t-992');
      expect(result.html).toContain('In Progress');
      // Status badge color for in_progress is Amber (#92400E or #FEF3C7)
      expect(result.html).toContain('#92400E');
      expect(result.html).toContain('https://ticketeer.io/tickets/t-992');

      expect(result.text).toContain('Ticket #t-992 has been assigned to you.');
      expect(result.text).toContain('Status: In Progress');
    });

    it('renders ticket-status-changed template with visual status transition', () => {
      const result = service.render('ticket-status-changed', {
        requesterName: 'Sarah Connor',
        ticketId: 't-105',
        ticketTitle: 'Login button unresponsive on iOS Safari',
        fromStatus: 'open',
        toStatus: 'resolved',
        ticketUrl: 'https://ticketeer.io/tickets/t-105',
      });

      expect(result.subject).toBe('[Ticket #t-105] Status updated to Resolved: Login button unresponsive on iOS Safari');
      expect(result.html).toContain('Sarah Connor');
      expect(result.html).toContain('Open');
      expect(result.html).toContain('Resolved');
      expect(result.html).toContain('&rarr;');
      expect(result.html).toContain('https://ticketeer.io/tickets/t-105');

      expect(result.text).toContain('Status: Open → Resolved');
    });
  });

  describe('EJS parsing', () => {
    it('renders verify-email template with EJS parser', () => {
      const result = service.renderEjs('verify-email', {
        name: 'Jane Doe',
        verifyUrl: 'https://ticketeer.io/verify?token=abc-123',
        expiresInHours: 48,
      });

      expect(result.subject).toBe('Verify your email');
      expect(result.html).toContain('Jane Doe');
      expect(result.html).toContain('https://ticketeer.io/verify?token=abc-123');
      expect(result.html).toContain('Expires in 48 hours');
      expect(result.text).toContain('Hi Jane Doe,');
    });

    it('renders ticket-assigned template with EJS parser', () => {
      const result = service.renderEjs('ticket-assigned', {
        assigneeName: 'Alex Rivera',
        ticketId: 't-992',
        ticketTitle: 'Database Connection Pool Exhausted',
        ticketStatus: 'in_progress',
        ticketUrl: 'https://ticketeer.io/tickets/t-992',
      });

      expect(result.subject).toBe('[Ticket #t-992] Assigned to you: Database Connection Pool Exhausted');
      expect(result.html).toContain('Alex Rivera');
      expect(result.html).toContain('t-992');
      expect(result.html).toContain('View Ticket');
    });

    it('renders ticket-status-changed template with EJS parser', () => {
      const result = service.renderEjs('ticket-status-changed', {
        requesterName: 'Sarah Connor',
        ticketId: 't-105',
        ticketTitle: 'Login button unresponsive on iOS Safari',
        fromStatus: 'open',
        toStatus: 'resolved',
        ticketUrl: 'https://ticketeer.io/tickets/t-105',
      });

      expect(result.subject).toBe('[Ticket #t-105] Status updated to Resolved: Login button unresponsive on iOS Safari');
      expect(result.html).toContain('Sarah Connor');
      expect(result.html).toContain('open');
      expect(result.html).toContain('resolved');
    });
  });
});

