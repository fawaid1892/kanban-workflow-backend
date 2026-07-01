import { Module } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowSettingsService } from './workflow-settings.service';
import { DatabaseModule } from '../database/database.module';
import { BoardModule } from '../board/board.module';

@Module({
  imports: [DatabaseModule, BoardModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowSettingsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
