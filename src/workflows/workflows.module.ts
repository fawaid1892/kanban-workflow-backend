import { Module } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowSettingsService } from './workflow-settings.service';

@Module({
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowSettingsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
