import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { TicketingModule } from '../ticketing/ticketing.module.js';
import { MAILER, MailtrapMailer } from './mailer.js';
import { NotificationHandler } from './notification.handler.js';
import { OutboxWorker } from './outbox.worker.js';

@Module({
  imports: [IdentityModule, TicketingModule],
  providers: [NotificationHandler, OutboxWorker, { provide: MAILER, useClass: MailtrapMailer }],
})
export class NotificationsModule {}
