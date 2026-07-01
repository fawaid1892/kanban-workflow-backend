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

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  duplicate(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.duplicate(id);
  }

  @Get('templates')
  getTemplates() {
    return this.workflowsService.getTemplates();
  }

  @Get(':id/export')
  exportWorkflow(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.exportWorkflow(id);
  }

  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  importWorkflow(@Body() dto: any) {
    return this.workflowsService.importWorkflow(dto);
  }

  @Get(':id/analytics')
  getAnalytics(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.getAnalytics(id);
  }

  @Get(':id/activity')
  getActivity(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.getActivityLogs(id);
  }

  // Versions
  @Post(':id/versions')
  @HttpCode(HttpStatus.CREATED)
  snapshotVersion(@Param('id', ParseIntPipe) id: number, @Body('changeSummary') summary?: string) {
    return this.workflowsService.snapshotVersion(id, summary);
  }

  @Get(':id/versions')
  getVersions(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.getVersions(id);
  }

  @Get(':id/versions/:vid')
  getVersion(@Param('id', ParseIntPipe) id: number, @Param('vid', ParseIntPipe) vid: number) {
    return this.workflowsService.getVersion(id, vid);
  }

  @Get(':id/versions/compare')
  compareVersions(@Param('id', ParseIntPipe) id: number, @Query('v1') v1: string, @Query('v2') v2: string) {
    return this.workflowsService.compareVersions(id, parseInt(v1), parseInt(v2));
  }

  // Batch Export
  @Get('export-all')
  exportAll() {
    return this.workflowsService.exportAll();
  }

  // Webhook
  @Get(':id/webhook')
  getWebhook(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.getWebhook(id);
  }

  @Put(':id/webhook')
  upsertWebhook(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.workflowsService.upsertWebhook(id, dto);
  }

  // Columns
  @Get(':id/columns')
  getColumns(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.getColumns(id);
  }

  @Post(':id/columns')
  @HttpCode(HttpStatus.CREATED)
  createColumn(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.workflowsService.createColumn(id, dto);
  }

  @Delete(':id/columns/:cid')
  deleteColumn(@Param('id', ParseIntPipe) id: number, @Param('cid', ParseIntPipe) cid: number) {
    return this.workflowsService.deleteColumn(id, cid);
  }

  // Search
  @Get('search')
  search(@Query('q') q: string) {
    return this.workflowsService.searchWorkflows(q ?? '');
  }

  // Tags
  @Get('tags')
  getAllTags() {
    return this.workflowsService.getAllTags();
  }

  @Get(':id/tags')
  getTags(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.getTags(id);
  }

  @Post(':id/tags')
  @HttpCode(HttpStatus.CREATED)
  addTag(@Param('id', ParseIntPipe) id: number, @Body('tag') tag: string) {
    return this.workflowsService.addTag(id, tag);
  }

  @Delete(':id/tags/:tag')
  removeTag(@Param('id', ParseIntPipe) id: number, @Param('tag') tag: string) {
    return this.workflowsService.removeTag(id, tag);
  }

  // Favorites + Archive
  @Put(':id/favorite')
  toggleFavorite(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.toggleFavorite(id);
  }

  @Put(':id/archive')
  toggleArchive(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.toggleArchive(id);
  }

  // Gantt
  @Get(':id/gantt')
  getGantt(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.getGantt(id);
  }

  // Time Tracking
  @Get(':id/time-logs')
  getTimeLogs(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.getTimeLogs(id);
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
