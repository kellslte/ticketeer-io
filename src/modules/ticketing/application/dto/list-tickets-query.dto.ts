import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import { TicketStatus } from '../../domain/ticket-status.js';

export const SORT_OPTIONS = ['createdAt:desc', 'createdAt:asc'] as const;

export class ListTicketsQueryDto {
  @IsOptional() @IsIn(Object.values(TicketStatus)) status?: TicketStatus;
  /** A user id, or `me` for the caller. */
  @ValidateIf((o: ListTicketsQueryDto) => o.assigneeId !== undefined && o.assigneeId !== 'me')
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 20;
  @ApiPropertyOptional({ enum: SORT_OPTIONS, default: 'createdAt:desc' })
  @IsOptional() @IsIn(SORT_OPTIONS) sort: (typeof SORT_OPTIONS)[number] = 'createdAt:desc';
}
