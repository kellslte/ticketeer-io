import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ChangeUserRoleUseCase } from '../../application/change-user-role.use-case.js';
import { ChangeRoleDto } from '../../application/dto/change-role.dto.js';
import { CurrentUser, Roles, type AuthUser } from './decorators.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly changeUserRole: ChangeUserRoleUseCase) {}

  @Roles('admin')
  @Patch(':id/role')
  changeRole(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.changeUserRole.execute(actor.id, id, dto.role);
  }
}
