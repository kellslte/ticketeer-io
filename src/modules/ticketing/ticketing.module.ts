import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AGENT_DIRECTORY } from './domain/agent-directory.js';
import { TICKET_REPOSITORY } from './domain/ticket.repository.js';
import { DrizzleTicketRepository } from './infrastructure/drizzle-ticket.repository.js';
import { IdentityAgentDirectory } from './infrastructure/identity-agent-directory.js';

@Module({
  imports: [IdentityModule],
  providers: [
    { provide: TICKET_REPOSITORY, useClass: DrizzleTicketRepository },
    { provide: AGENT_DIRECTORY, useClass: IdentityAgentDirectory },
  ],
  exports: [TICKET_REPOSITORY, AGENT_DIRECTORY],
})
export class TicketingModule {}
