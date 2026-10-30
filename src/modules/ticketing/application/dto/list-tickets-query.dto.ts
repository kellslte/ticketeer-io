import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TicketStatus } from '../../domain/ticket-status.js';

export const SORT_OPTIONS = ['createdAt:desc', 'createdAt:asc'] as const;

export class ListTicketsQueryDto {
  @IsOptional() @IsIn(Object.values(TicketStatus)) status?: TicketStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 20;
  @IsOptional() @IsIn(SORT_OPTIONS) sort: (typeof SORT_OPTIONS)[number] = 'createdAt:desc';
}
