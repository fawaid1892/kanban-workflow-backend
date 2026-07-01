import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus,
  ValidationPipe, ParseIntPipe,
} from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { SetDependenciesDto } from './dto/set-dependencies.dto';
import { RunWorkflowDto } from './dto/run-workflow.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { WorkflowSettingsService } from './workflow-settings.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly settingsService: WorkflowSettingsService,
  ) {}

  // ── Workflow CRUD ──

  @Get()
  findAll() {
    return this.workflowsService.findAll();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: CreateWorkflowDto,
  ) {
    return this.workflowsService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.remove(id);
  }

  // ── Stage CRUD ──

  @Post(':id/stages')
  @HttpCode(HttpStatus.CREATED)
  addStage(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: CreateStageDto,
  ) {
    return this.workflowsService.addStage(id, dto);
  }

  @Get(':id/stages')
  getStages(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.getStages(id);
  }

  @Put(':id/stages/:stageId')
  updateStage(
    @Param('id', ParseIntPipe) id: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateStageDto,
  ) {
    return this.workflowsService.updateStage(id, stageId, dto);
  }

  @Delete(':id/stages/:stageId')
  @HttpCode(HttpStatus.OK)
  removeStage(
    @Param('id', ParseIntPipe) id: number,
    @Param('stageId', ParseIntPipe) stageId: number,
  ) {
    return this.workflowsService.removeStage(id, stageId);
  }

  // ── Dependencies ──

  @Put(':id/stages/:stageId/deps')
  setDependencies(
    @Param('id', ParseIntPipe) id: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: SetDependenciesDto,
  ) {
    return this.workflowsService.setDependencies(id, stageId, dto);
  }

  @Get(':id/graph')
  getGraph(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.getGraph(id);
  }

  // ── Execution ──

  @Post(':id/run')
  @HttpCode(HttpStatus.CREATED)
  runWorkflow(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: RunWorkflowDto,
  ) {
    return this.workflowsService.runWorkflow(id, dto);
  }

  @Get(':id/runs')
  getRuns(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.getRuns(id);
  }

  @Get(':id/runs/:runId')
  getRun(
    @Param('id', ParseIntPipe) id: number,
    @Param('runId', ParseIntPipe) runId: number,
  ) {
    return this.workflowsService.getRun(id, runId);
  }

  // ── Settings ──

  @Get(':id/settings')
  getSettings(@Param('id', ParseIntPipe) id: number) {
    return this.settingsService.getSettings(id);
  }

  @Put(':id/settings')
  updateSettings(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateSettingsDto,
  ) {
    return this.settingsService.updateSettings(id, dto);
  }
}
