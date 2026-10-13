import { Module } from '@nestjs/common';
import { DefinitionVersionsService } from './definition-versions.service';
import { DefinitionVersionsController } from './definition-versions.controller';

@Module({
  providers: [DefinitionVersionsService],
  controllers: [DefinitionVersionsController],
  exports: [DefinitionVersionsService],
})
export class DefinitionVersionsModule {}
