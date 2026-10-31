import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { TicketingModule } from '../ticketing/ticketing.module.js';
import { MAILER, MailtrapMailer } from './mailer.js';
import { NotificationHandler } from './notification.handler.js';
import { OutboxWorker } from './outbox.worker.js';
import { TemplateService } from './templates/template.service.js';

@Module({
  imports: [IdentityModule, TicketingModule],
  providers: [
    TemplateService,
    NotificationHandler,
    OutboxWorker,
    { provide: MAILER, useClass: MailtrapMailer },
  ],
  exports: [TemplateService, MAILER],
})
export class NotificationsModule {}
