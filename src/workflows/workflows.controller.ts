import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { SetDependenciesDto } from './dto/set-dependencies.dto';
import { RunWorkflowDto } from './dto/run-workflow.dto';

@Controller('api/workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  // ── S5-01: Workflow CRUD ──

  @Get()
  async findAll() {
    return this.workflowsService.findAll();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: CreateWorkflowDto,
  ) {
    return this.workflowsService.create(dto);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.findOne(id);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.remove(id);
  }

  // ── S5-02: Stage CRUD ──

  @Post(':id/stages')
  @HttpCode(HttpStatus.CREATED)
  async addStage(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: CreateStageDto,
  ) {
    return this.workflowsService.addStage(id, dto);
  }

  @Get(':id/stages')
  async getStages(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.getStages(id);
  }

  @Put(':id/stages/:stageId')
  async updateStage(
    @Param('id', ParseIntPipe) id: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateStageDto,
  ) {
    return this.workflowsService.updateStage(id, stageId, dto);
  }

  @Delete(':id/stages/:stageId')
  @HttpCode(HttpStatus.OK)
  async removeStage(
    @Param('id', ParseIntPipe) id: number,
    @Param('stageId', ParseIntPipe) stageId: number,
  ) {
    return this.workflowsService.removeStage(id, stageId);
  }

  // ── S5-03: Dependency Management ──

  @Put(':id/stages/:stageId/deps')
  async setDependencies(
    @Param('id', ParseIntPipe) id: number,
    @Param('stageId', ParseIntPipe) stageId: number,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: SetDependenciesDto,
  ) {
    return this.workflowsService.setDependencies(id, stageId, dto);
  }

  @Get(':id/graph')
  async getGraph(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.getGraph(id);
  }

  // ── S6: Workflow Execution ──

  @Post(':id/run')
  @HttpCode(HttpStatus.CREATED)
  async runWorkflow(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: RunWorkflowDto,
  ) {
    return this.workflowsService.runWorkflow(id, dto);
  }

  // ── S6: Run History ──

  @Get(':id/runs')
  async getRuns(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.getRuns(id);
  }

  @Get(':id/runs/:runId')
  async getRun(
    @Param('id', ParseIntPipe) id: number,
    @Param('runId', ParseIntPipe) runId: number,
  ) {
    return this.workflowsService.getRun(id, runId);
  }
}
