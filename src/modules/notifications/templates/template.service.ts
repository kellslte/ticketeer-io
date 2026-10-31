import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import ejs from 'ejs';
import { BRAND, type TicketStatusKey } from './brand.js';
import type {
  EmailTemplateMap,
  EmailTemplateName,
  RenderedEmail,
  TicketAssignedTemplateData,
  TicketStatusChangedTemplateData,
  VerifyEmailTemplateData,
} from './types.js';

export const TEMPLATE_SERVICE = Symbol('TEMPLATE_SERVICE');

@Injectable()
export class TemplateService {
  private readonly logger = new Logger('TemplateService');
  private readonly appUrl: string;
  private readonly hbsInstance: typeof Handlebars;
  private readonly templatesDir: string;
  private readonly compiledHbsTemplates: Map<string, Handlebars.TemplateDelegate> = new Map();

  constructor(config: ConfigService) {
    this.appUrl = config.get<string>('APP_URL') || 'http://localhost:3000';
    this.hbsInstance = Handlebars.create();

    // Determine views directory relative to current file or working directory
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidateDirs = [
      path.join(currentDir, 'views'),
      path.resolve(process.cwd(), 'src/modules/notifications/templates/views'),
      path.resolve(process.cwd(), 'dist/src/modules/notifications/templates/views'),
      path.resolve(process.cwd(), 'dist/modules/notifications/templates/views'),
    ];
    this.templatesDir = candidateDirs.find((d) => fs.existsSync(d)) || candidateDirs[0]!;

    this.registerHandlebarsHelpers();
    this.initializeHandlebarsTemplates();
  }

  private registerHandlebarsHelpers(): void {
    this.hbsInstance.registerHelper('statusBadge', (status: string) => {
      const normalized = (status || '').toLowerCase() as TicketStatusKey;
      const meta = BRAND.colors.status[normalized] || {
        label: status || 'Unknown',
        color: '#475569',
        background: '#F1F5F9',
        border: '#CBD5E1',
      };

      const html = `<span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; color: ${meta.color}; background-color: ${meta.background}; border: 1px solid ${meta.border}; border-radius: 9999px; letter-spacing: 0.02em; text-transform: capitalize;">${meta.label}</span>`;
      return new this.hbsInstance.SafeString(html);
    });

    this.hbsInstance.registerHelper('statusLabel', (status: string) => {
      const normalized = (status || '').toLowerCase() as TicketStatusKey;
      return BRAND.colors.status[normalized]?.label || status;
    });

    this.hbsInstance.registerHelper('formatDate', (dateVal: string | Date | undefined) => {
      if (!dateVal) return '';
      const date = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    });

    this.hbsInstance.registerHelper('eq', (a: unknown, b: unknown) => a === b);

    this.hbsInstance.registerHelper('year', () => new Date().getFullYear());
  }

  private readTemplateFile(subPath: string): string {
    const filePath = path.join(this.templatesDir, subPath);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    throw new Error(`Template file not found at: ${filePath}`);
  }

  private initializeHandlebarsTemplates(): void {
    try {
      const baseLayoutSource = this.readTemplateFile('handlebars/base.hbs');
      this.compiledHbsTemplates.set('base', this.hbsInstance.compile(baseLayoutSource));

      const templates: EmailTemplateName[] = ['verify-email', 'ticket-assigned', 'ticket-status-changed'];
      for (const t of templates) {
        const source = this.readTemplateFile(`handlebars/${t}.hbs`);
        this.compiledHbsTemplates.set(t, this.hbsInstance.compile(source));
      }
    } catch (err) {
      this.logger.error(`Failed to load Handlebars templates from disk: ${(err as Error).message}`);
    }
  }

  /**
   * Render an email using Handlebars as the parser (Default).
   */
  render<T extends EmailTemplateName>(templateName: T, data: EmailTemplateMap[T]): RenderedEmail {
    const year = data.year ?? new Date().getFullYear();
    const appUrl = data.appUrl ?? this.appUrl;
    const enrichedData = { ...data, year, appUrl };

    const viewDelegate = this.compiledHbsTemplates.get(templateName);
    if (!viewDelegate) {
      throw new Error(`Compiled Handlebars template not found for: ${templateName}`);
    }

    const baseDelegate = this.compiledHbsTemplates.get('base');
    if (!baseDelegate) {
      throw new Error('Base Handlebars layout not found');
    }

    const subject = this.buildSubject(templateName, enrichedData);
    const bodyHtml = viewDelegate(enrichedData);
    const finalHtml = baseDelegate({
      ...enrichedData,
      subject,
      body: bodyHtml,
    });
    const text = this.generatePlainText(templateName, enrichedData);

    return { subject, html: finalHtml, text };
  }

  /**
   * Render an email using EJS as the parser.
   */
  renderEjs<T extends EmailTemplateName>(templateName: T, data: EmailTemplateMap[T]): RenderedEmail {
    const year = data.year ?? new Date().getFullYear();
    const appUrl = data.appUrl ?? this.appUrl;
    const enrichedData = { ...data, year, appUrl };

    const subject = this.buildSubject(templateName, enrichedData);
    const templateSource = this.readTemplateFile(`ejs/${templateName}.ejs`);
    const html = ejs.render(templateSource, { ...enrichedData, subject });
    const text = this.generatePlainText(templateName, enrichedData);

    return { subject, html, text };
  }

  private buildSubject(templateName: EmailTemplateName, data: any): string {
    switch (templateName) {
      case 'verify-email':
        return 'Verify your email address · Ticketeer';
      case 'ticket-assigned': {
        const d = data as TicketAssignedTemplateData;
        return `[Ticket #${d.ticketId}] Assigned to you: ${d.ticketTitle}`;
      }
      case 'ticket-status-changed': {
        const d = data as TicketStatusChangedTemplateData;
        const normalized = (d.toStatus || '').toLowerCase() as TicketStatusKey;
        const label = BRAND.colors.status[normalized]?.label || d.toStatus;
        return `[Ticket #${d.ticketId}] Status updated to ${label}: ${d.ticketTitle}`;
      }
      default:
        return 'Ticketeer Notification';
    }
  }

  private generatePlainText(templateName: EmailTemplateName, data: any): string {
    switch (templateName) {
      case 'verify-email': {
        const d = data as VerifyEmailTemplateData;
        return [
          `Hi ${d.name},`,
          '',
          'Welcome to Ticketeer! Please verify your email address to activate your account.',
          '',
          `Verify your email: ${d.verifyUrl}`,
          '',
          `This verification link will expire in ${d.expiresInHours || 24} hours.`,
          '',
          'If you did not register for an account with Ticketeer, you can ignore this email.',
          '',
          '— The Ticketeer Team',
          `${d.appUrl}`,
        ].join('\n');
      }
      case 'ticket-assigned': {
        const d = data as TicketAssignedTemplateData;
        const normalized = (d.ticketStatus || '').toLowerCase() as TicketStatusKey;
        const label = BRAND.colors.status[normalized]?.label || d.ticketStatus;
        const lines = [
          `Hi ${d.assigneeName},`,
          '',
          `Ticket #${d.ticketId} has been assigned to you.`,
          '',
          `Title: ${d.ticketTitle}`,
          `Status: ${label}`,
        ];
        if (d.ticketDescription) {
          lines.push(`Description: ${d.ticketDescription}`);
        }
        lines.push(
          '',
          `View ticket: ${d.ticketUrl}`,
          '',
          '— Ticketeer Support System',
          `${d.appUrl}`,
        );
        return lines.join('\n');
      }
      case 'ticket-status-changed': {
        const d = data as TicketStatusChangedTemplateData;
        const fromLabel = BRAND.colors.status[d.fromStatus.toLowerCase() as TicketStatusKey]?.label || d.fromStatus;
        const toLabel = BRAND.colors.status[d.toStatus.toLowerCase() as TicketStatusKey]?.label || d.toStatus;
        return [
          `Hi ${d.requesterName},`,
          '',
          `The status of your ticket #${d.ticketId} has been updated.`,
          '',
          `Ticket: "${d.ticketTitle}"`,
          `Status: ${fromLabel} → ${toLabel}`,
          '',
          `View ticket details: ${d.ticketUrl}`,
          '',
          '— Ticketeer Support System',
          `${d.appUrl}`,
        ].join('\n');
      }
      default:
        return 'Ticketeer Notification';
    }
  }
}
