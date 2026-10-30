import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../../identity/interfaces/http/decorators.js';
import { CreateTicketDto } from '../../application/dto/create-ticket.dto.js';
import { ListTicketsQueryDto } from '../../application/dto/list-tickets-query.dto.js';
import { UpdateTicketDto } from '../../application/dto/update-ticket.dto.js';
import { CreateTicketUseCase } from '../../application/create-ticket.use-case.js';
import { DeleteTicketUseCase } from '../../application/delete-ticket.use-case.js';
import { GetTicketUseCase } from '../../application/get-ticket.use-case.js';
import { ListTicketsUseCase } from '../../application/list-tickets.use-case.js';
import { UpdateTicketUseCase } from '../../application/update-ticket.use-case.js';

// AuthUser ({ id, role }) is structurally the Actor that Ticketing's domain expects.
@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly createTicket: CreateTicketUseCase,
    private readonly listTickets: ListTicketsUseCase,
    private readonly getTicket: GetTicketUseCase,
    private readonly updateTicket: UpdateTicketUseCase,
    private readonly deleteTicket: DeleteTicketUseCase,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.createTicket.execute(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListTicketsQueryDto) {
    return this.listTickets.execute(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.getTicket.execute(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTicketDto) {
    return this.updateTicket.execute(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteTicket.execute(user, id);
  }
}
