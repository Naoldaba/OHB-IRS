import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';

@Module({
  imports: [UsersModule],
  providers: [RolesService],
  controllers: [RolesController],
})
export class RolesModule {}
