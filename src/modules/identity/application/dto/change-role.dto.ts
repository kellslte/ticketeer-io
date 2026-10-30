import { IsIn } from 'class-validator';
import { Role } from '../../domain/role.js';

export class ChangeRoleDto {
  @IsIn(Object.values(Role)) role!: Role;
}
