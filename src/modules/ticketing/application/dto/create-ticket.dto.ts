import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { trim } from '../../../../shared/dto/transforms.js';
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX, TITLE_MIN } from '../../domain/ticket-fields.js';

/** Deliberately only these two fields: `status`, `assigneeId`, etc. are rejected by the global pipe. */
export class CreateTicketDto {
  @Transform(trim) @IsString() @Length(TITLE_MIN, TITLE_MAX) title!: string;
  @Transform(trim) @IsString() @Length(DESCRIPTION_MIN, DESCRIPTION_MAX) description!: string;
}
