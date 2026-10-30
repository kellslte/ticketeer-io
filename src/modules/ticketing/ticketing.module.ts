import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { CreateTicketUseCase } from './application/create-ticket.use-case.js';
import { DeleteTicketUseCase } from './application/delete-ticket.use-case.js';
import { GetTicketUseCase } from './application/get-ticket.use-case.js';
import { ListTicketsUseCase } from './application/list-tickets.use-case.js';
import { TicketEventsLogger } from './application/ticket-events.logger.js';
import { UpdateTicketUseCase } from './application/update-ticket.use-case.js';
import { AGENT_DIRECTORY } from './domain/agent-directory.js';
import { TICKET_REPOSITORY } from './domain/ticket.repository.js';
import { DrizzleTicketRepository } from './infrastructure/drizzle-ticket.repository.js';
import { IdentityAgentDirectory } from './infrastructure/identity-agent-directory.js';
import { TicketsController } from './interfaces/http/tickets.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [TicketsController],
  providers: [
    CreateTicketUseCase,
    ListTicketsUseCase,
    GetTicketUseCase,
    UpdateTicketUseCase,
    DeleteTicketUseCase,
    TicketEventsLogger,
    { provide: TICKET_REPOSITORY, useClass: DrizzleTicketRepository },
    { provide: AGENT_DIRECTORY, useClass: IdentityAgentDirectory },
  ],
  exports: [TICKET_REPOSITORY, AGENT_DIRECTORY],
})
export class TicketingModule {}
