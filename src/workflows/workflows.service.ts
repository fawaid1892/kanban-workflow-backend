import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, asc, inArray } from 'drizzle-orm';
import * as schema from '../database/schema';
import { DRIZZLE } from '../database/database.module';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { SetDependenciesDto } from './dto/set-dependencies.dto';
import { RunWorkflowDto } from './dto/run-workflow.dto';
import { parseTemplate } from './template-parser';
import { createKanbanTask, setTaskParents, createBoard, createProfile } from './kanban-client';

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private boardSlug(workflowId: number): string {
    return `wf-${workflowId}`;
  }

  // ── Workflow CRUD ──

  async findAll() {
    return this.db
      .select()
      .from(schema.workflows)
      .orderBy(asc(schema.workflows.createdAt));
  }

  async findOne(id: number) {
    const [workflow] = await this.db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, id))
      .limit(1);

    if (!workflow) {
      throw new NotFoundException(`Workflow with ID '${id}' not found`);
    }

    const stages = await this.db
      .select()
      .from(schema.workflowStages)
      .where(eq(schema.workflowStages.workflowId, id))
      .orderBy(asc(schema.workflowStages.sortOrder));

    return { ...workflow, stages };
  }

  async create(dto: CreateWorkflowDto) {
    const nextId = await this.resolveNextWorkflowId();

    const [workflow] = await this.db
      .insert(schema.workflows)
      .values({
        id: nextId,
        name: dto.name,
        description: dto.description ?? null,
      })
      .returning();

    // Create Hermes board for this workflow
    await createBoard(this.boardSlug(nextId), dto.name);

    return { ...workflow, stages: [] };
  }

  async update(id: number, dto: UpdateWorkflowDto) {
    await this.findWorkflowOrThrow(id);

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;

    if (Object.keys(updateData).length > 1) {
      await this.db
        .update(schema.workflows)
        .set(updateData)
        .where(eq(schema.workflows.id, id));
    }

    return this.findOne(id);
  }

  async remove(id: number) {
    await this.findWorkflowOrThrow(id);
    await this.db.delete(schema.workflows).where(eq(schema.workflows.id, id));
    return { deleted: true, id };
  }

  // ── Stage CRUD ──

  async addStage(workflowId: number, dto: CreateStageDto) {
    await this.findWorkflowOrThrow(workflowId);

    const nextId = await this.resolveNextStageId();

    // Create Hermes profile for this role
    await createProfile(dto.roleSlug);

    const [stage] = await this.db
      .insert(schema.workflowStages)
      .values({
        id: nextId,
        workflowId,
        titleTemplate: dto.titleTemplate,
        roleSlug: dto.roleSlug,
        roleLabel: dto.roleLabel,
        initialStatus: dto.initialStatus ?? 'todo',
        maxRuntime: dto.maxRuntime ?? null,
        maxRetries: dto.maxRetries ?? 2,
        skills: dto.skills ?? null,
        goalMode: dto.goalMode ?? false,
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();

    return stage;
  }

  async getStages(workflowId: number) {
    await this.findWorkflowOrThrow(workflowId);

    return this.db
      .select()
      .from(schema.workflowStages)
      .where(eq(schema.workflowStages.workflowId, workflowId))
      .orderBy(asc(schema.workflowStages.sortOrder));
  }

  async updateStage(workflowId: number, stageId: number, dto: UpdateStageDto) {
    await this.findWorkflowOrThrow(workflowId);
    await this.findStageOrThrow(stageId);

    const updateData: Record<string, unknown> = {};
    const fields: (keyof UpdateStageDto)[] = [
      'titleTemplate', 'roleSlug', 'roleLabel', 'initialStatus',
      'maxRuntime', 'maxRetries', 'skills', 'goalMode', 'sortOrder',
    ];

    for (const field of fields) {
      if (dto[field] !== undefined) {
        updateData[field] = dto[field];
      }
    }

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(schema.workflowStages)
        .set(updateData)
        .where(eq(schema.workflowStages.id, stageId));
    }

    const [stage] = await this.db
      .select()
      .from(schema.workflowStages)
      .where(eq(schema.workflowStages.id, stageId))
      .limit(1);

    return stage;
  }

  async removeStage(workflowId: number, stageId: number) {
    await this.findWorkflowOrThrow(workflowId);
    await this.findStageOrThrow(stageId);

    await this.db
      .delete(schema.workflowStages)
      .where(eq(schema.workflowStages.id, stageId));

    return { deleted: true, stageId };
  }

  // ── Dependency Management ──

  async setDependencies(
    workflowId: number,
    stageId: number,
    dto: SetDependenciesDto,
  ) {
    await this.findWorkflowOrThrow(workflowId);
    await this.findStageOrThrow(stageId);

    const { parentIds } = dto;

    if (parentIds.length > 0) {
      const parentStages = await this.db
        .select()
        .from(schema.workflowStages)
        .where(inArray(schema.workflowStages.id, parentIds));

      if (parentStages.length !== parentIds.length) {
        throw new NotFoundException('One or more parent stages not found');
      }

      for (const ps of parentStages) {
        if (ps.workflowId !== workflowId) {
          throw new BadRequestException(
            `Parent stage ${ps.id} does not belong to workflow ${workflowId}`,
          );
        }
      }

      const allDeps = await this.db
        .select()
        .from(schema.stageDependencies);

      if (this.hasCycle(stageId, parentIds, allDeps)) {
        throw new BadRequestException(
          'Adding these dependencies would create a circular dependency',
        );
      }
    }

    await this.db
      .delete(schema.stageDependencies)
      .where(eq(schema.stageDependencies.stageId, stageId));

    for (const parentId of parentIds) {
      const nextDepId = await this.resolveNextDepId();
      await this.db.insert(schema.stageDependencies).values({
        id: nextDepId,
        stageId,
        parentId,
      });
    }

    return { stageId, parentIds };
  }

  async getGraph(workflowId: number) {
    await this.findWorkflowOrThrow(workflowId);

    const [workflow] = await this.db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, workflowId))
      .limit(1);

    const stages = await this.db
      .select()
      .from(schema.workflowStages)
      .where(eq(schema.workflowStages.workflowId, workflowId))
      .orderBy(asc(schema.workflowStages.sortOrder));

    const deps = await this.db
      .select()
      .from(schema.stageDependencies);

    const stageGraph = stages.map((stage) => {
      const parents = deps
        .filter((d) => d.stageId === stage.id)
        .map((d) => d.parentId);
      const children = deps
        .filter((d) => d.parentId === stage.id)
        .map((d) => d.stageId);
      return { ...stage, parents, children };
    });

    return { workflow, stages: stageGraph };
  }

  // ── Workflow Execution ──

  async runWorkflow(workflowId: number, dto: RunWorkflowDto) {
    await this.findWorkflowOrThrow(workflowId);

    const stages = await this.db
      .select()
      .from(schema.workflowStages)
      .where(eq(schema.workflowStages.workflowId, workflowId))
      .orderBy(asc(schema.workflowStages.sortOrder));

    if (stages.length === 0) {
      throw new BadRequestException('Workflow has no stages');
    }

    const allDeps = await this.db
      .select()
      .from(schema.stageDependencies);

    const stageIds = new Set(stages.map((s) => s.id));
    const deps = allDeps.filter(
      (d) => stageIds.has(d.stageId) && stageIds.has(d.parentId),
    );

    const sorted = this.topologicalSort(stages, deps, dto.skipStages ?? []);

    const runId = await this.resolveNextRunId();
    await this.db.insert(schema.workflowRuns).values({
      id: runId,
      workflowId,
      params: dto.params,
      taskIds: [],
      status: 'running',
    });

    this.executeWorkflowRun(workflowId, runId, sorted, deps, dto).catch((err) => {
      this.logger.error(`Workflow run ${runId} failed: ${err.message}`);
      this.db
        .update(schema.workflowRuns)
        .set({ status: 'failed', completedAt: new Date() })
        .where(eq(schema.workflowRuns.id, runId));
    });

    return { runId, status: 'running' };
  }

  private async executeWorkflowRun(
    workflowId: number,
    runId: number,
    sorted: typeof schema.workflowStages.$inferSelect[],
    deps: { stageId: number; parentId: number }[],
    dto: RunWorkflowDto,
  ) {
    const board = this.boardSlug(workflowId);
    const taskIds = new Map<number, string>();

    for (const stage of sorted) {
      const parsedTitle = parseTemplate(stage.titleTemplate, dto.params);

      const taskId = await createKanbanTask({
        title: parsedTitle,
        board,
        assignee: stage.roleSlug,
        status: stage.initialStatus,
        skills: stage.skills ?? undefined,
        maxRuntime: stage.maxRuntime ?? undefined,
        maxRetries: stage.maxRetries ?? undefined,
        goalMode: stage.goalMode ?? false,
      });

      taskIds.set(stage.id, taskId);
    }

    for (const stage of sorted) {
      const stageDeps = deps.filter((d) => d.stageId === stage.id);
      if (stageDeps.length > 0) {
        const parentIdStrs = stageDeps
          .map((d) => taskIds.get(d.parentId))
          .filter(Boolean) as string[];
        const taskId = taskIds.get(stage.id);
        if (taskId && parentIdStrs.length > 0) {
          await setTaskParents(taskId, parentIdStrs, board);
        }
      }
    }

    const allTaskIds = Array.from(taskIds.values());
    await this.db
      .update(schema.workflowRuns)
      .set({ taskIds: allTaskIds, status: 'completed', completedAt: new Date() })
      .where(eq(schema.workflowRuns.id, runId));

    this.logger.log(`Workflow run ${runId} completed: ${allTaskIds.length} tasks created`);
  }

  private topologicalSort(
    stages: typeof schema.workflowStages.$inferSelect[],
    deps: { stageId: number; parentId: number }[],
    skipIds: number[],
  ): typeof schema.workflowStages.$inferSelect[] {
    const skipSet = new Set(skipIds);
    const filtered = stages.filter((s) => !skipSet.has(s.id));
    const filteredIds = new Set(filtered.map((s) => s.id));

    const inDegree = new Map<number, number>();
    const adj = new Map<number, number[]>();

    for (const s of filtered) {
      inDegree.set(s.id, 0);
      adj.set(s.id, []);
    }

    for (const dep of deps) {
      if (filteredIds.has(dep.stageId) && filteredIds.has(dep.parentId)) {
        adj.get(dep.parentId)!.push(dep.stageId);
        inDegree.set(dep.stageId, (inDegree.get(dep.stageId) ?? 0) + 1);
      }
    }

    const queue: number[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: typeof schema.workflowStages.$inferSelect[] = [];
    const stageMap = new Map(stages.map((s) => [s.id, s]));

    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(stageMap.get(current)!);
      for (const child of adj.get(current) ?? []) {
        const newDeg = (inDegree.get(child) ?? 1) - 1;
        inDegree.set(child, newDeg);
        if (newDeg === 0) queue.push(child);
      }
    }

    if (sorted.length !== filtered.length) {
      throw new BadRequestException('Circular dependency detected in workflow stages');
    }

    return sorted;
  }

  // ── Run History ──

  async getRuns(workflowId: number) {
    await this.findWorkflowOrThrow(workflowId);
    return this.db
      .select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.workflowId, workflowId))
      .orderBy(schema.workflowRuns.createdAt);
  }

  async getRun(workflowId: number, runId: number) {
    await this.findWorkflowOrThrow(workflowId);
    const [run] = await this.db
      .select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.id, runId))
      .limit(1);
    if (!run) throw new NotFoundException(`Run with ID '${runId}' not found`);
    return run;
  }

  // ── Helpers ──

  private async findWorkflowOrThrow(id: number) {
    const [workflow] = await this.db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, id))
      .limit(1);
    if (!workflow) throw new NotFoundException(`Workflow with ID '${id}' not found`);
    return workflow;
  }

  private async findStageOrThrow(stageId: number) {
    const [stage] = await this.db
      .select()
      .from(schema.workflowStages)
      .where(eq(schema.workflowStages.id, stageId))
      .limit(1);
    if (!stage) throw new NotFoundException(`Stage with ID '${stageId}' not found`);
    return stage;
  }

  private hasCycle(
    stageId: number,
    parentIds: number[],
    allDeps: { stageId: number; parentId: number }[],
  ): boolean {
    const adj = new Map<number, number[]>();
    for (const dep of allDeps) {
      if (dep.stageId === stageId) continue;
      if (!adj.has(dep.parentId)) adj.set(dep.parentId, []);
      adj.get(dep.parentId)!.push(dep.stageId);
    }

    const dfs = (current: number, target: number, visited: Set<number>): boolean => {
      if (current === target) return true;
      if (visited.has(current)) return false;
      visited.add(current);
      for (const child of adj.get(current) || []) {
        if (dfs(child, target, visited)) return true;
      }
      return false;
    };

    for (const parentId of parentIds) {
      const visited = new Set<number>();
      if (dfs(stageId, parentId, visited)) return true;
    }
    return false;
  }

  private async resolveNextWorkflowId(): Promise<number> {
    const all = await this.db.select({ id: schema.workflows.id }).from(schema.workflows);
    if (all.length === 0) return 1;
    let maxId = 0;
    for (const r of all) { if (r.id > maxId) maxId = r.id; }
    return maxId + 1;
  }

  private async resolveNextStageId(): Promise<number> {
    const all = await this.db.select({ id: schema.workflowStages.id }).from(schema.workflowStages);
    if (all.length === 0) return 1;
    let maxId = 0;
    for (const r of all) { if (r.id > maxId) maxId = r.id; }
    return maxId + 1;
  }

  private async resolveNextDepId(): Promise<number> {
    const all = await this.db.select({ id: schema.stageDependencies.id }).from(schema.stageDependencies);
    if (all.length === 0) return 1;
    let maxId = 0;
    for (const r of all) { if (r.id > maxId) maxId = r.id; }
    return maxId + 1;
  }

  private async resolveNextRunId(): Promise<number> {
    const all = await this.db.select({ id: schema.workflowRuns.id }).from(schema.workflowRuns);
    if (all.length === 0) return 1;
    let maxId = 0;
    for (const r of all) { if (r.id > maxId) maxId = r.id; }
    return maxId + 1;
  }
}
