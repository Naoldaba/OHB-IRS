import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RequireCapability, CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { UsersService } from '../users/users.service';
import { RolesService } from './roles.service';
import {
  AssignRoleDto,
  CreateRoleDto,
  UpdateRoleDto,
  UpdateRolePermissionsDto,
} from './dto';

/**
 * Role & permission administration (Phase 26; editable grants 28a; scope axis +
 * custom roles 28b). Requires `manage_roles`. Read endpoints surface the model
 * (matrix + roles + members); the write endpoints edit a role's capability
 * grants, create/edit/delete custom roles, and assign users to roles — all the
 * live authorization the server enforces. Capability keys remain code-defined;
 * editing here can only toggle grants the API already knows how to enforce.
 */
@Controller('roles')
@RequireCapability('manage_roles')
export class RolesController {
  constructor(
    private readonly roles: RolesService,
    private readonly users: UsersService,
  ) {}

  @Get()
  list() {
    return this.roles.listRoles();
  }

  @Get('permissions')
  permissions() {
    return this.roles.permissionMatrix();
  }

  /** Create a custom role (Phase 28b). */
  @Post()
  create(@Body() dto: CreateRoleDto, @CurrentUser() actor: AuthUser) {
    return this.roles.createRole(
      { name: dto.name, scope: dto.scope, description: dto.description, capabilityKeys: dto.capabilityKeys },
      actor.id,
    );
  }

  /** Edit a custom role's name / description / active state (system-protected). */
  @Patch(':name')
  update(
    @Param('name') name: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.roles.updateRole(name, dto, actor.id);
  }

  /** Delete a custom role (system roles and roles with members are protected). */
  @Delete(':name')
  remove(@Param('name') name: string, @CurrentUser() actor: AuthUser) {
    return this.roles.deleteRole(name, actor.id);
  }

  /** Replace a role's capability grants (Phase 28a). Validated + audited server-side. */
  @Patch(':name/permissions')
  updatePermissions(
    @Param('name') name: string,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.roles.updatePermissions(name, dto.capabilityKeys, actor.id);
  }

  @Get(':name/members')
  members(@Param('name') name: string) {
    return this.roles.members(name);
  }

  /** Assign a user to a role (delegates to UsersService for the contract + audit). */
  @Patch('assignments/:userId')
  assign(
    @Param('userId') userId: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.assignRole(userId, dto.role, dto.laboratoryId ?? null, actor.id);
  }
}
