import { Transform } from 'class-transformer';
import { IsIn, IsString, Length, ValidateIf } from 'class-validator';
import { trim } from '../../../../shared/dto/transforms.js';
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX, TITLE_MIN } from '../../domain/ticket-fields.js';
import { TicketStatus } from '../../domain/ticket-status.js';

// ValidateIf (not IsOptional) so an explicit `null` is rejected instead of silently skipped.
export class UpdateTicketDto {
  @ValidateIf((o: UpdateTicketDto) => o.title !== undefined)
  @Transform(trim) @IsString() @Length(TITLE_MIN, TITLE_MAX)
  title?: string;

  @ValidateIf((o: UpdateTicketDto) => o.description !== undefined)
  @Transform(trim) @IsString() @Length(DESCRIPTION_MIN, DESCRIPTION_MAX)
  description?: string;

  @ValidateIf((o: UpdateTicketDto) => o.status !== undefined)
  @IsIn(Object.values(TicketStatus))
  status?: TicketStatus;
}
