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
import { BoardGateway } from '../board/board.gateway';

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly boardGateway: BoardGateway,
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

  // ── Export / Import ──

  async exportWorkflow(workflowId: number) {
    const workflow = await this.findWorkflowOrThrow(workflowId);
    const stages = await this.db
      .select()
      .from(schema.workflowStages)
      .where(eq(schema.workflowStages.workflowId, workflowId))
      .orderBy(asc(schema.workflowStages.sortOrder));
    const allDeps = await this.db.select().from(schema.stageDependencies);
    const stageIds = new Set(stages.map((s) => s.id));
    const deps = allDeps.filter((d) => stageIds.has(d.stageId) && stageIds.has(d.parentId));
    const [settings] = await this.db
      .select()
      .from(schema.workflowSettings)
      .where(eq(schema.workflowSettings.workflowId, workflowId))
      .limit(1);
    return {
      name: workflow.name,
      description: workflow.description,
      stages: stages.map((s) => ({
        titleTemplate: s.titleTemplate,
        roleSlug: s.roleSlug,
        roleLabel: s.roleLabel,
        initialStatus: s.initialStatus,
        maxRuntime: s.maxRuntime,
        maxRetries: s.maxRetries,
        skills: s.skills,
        goalMode: s.goalMode,
        sortOrder: s.sortOrder,
      })),
      dependencies: deps.map((d) => ({
        parentIndex: stages.findIndex((s) => s.id === d.parentId),
        childIndex: stages.findIndex((s) => s.id === d.stageId),
      })),
      settings: settings ? { baseUrl: settings.baseUrl, chatSchema: settings.chatSchema } : null,
    };
  }

  async importWorkflow(data: { name: string; description?: string; stages: any[]; dependencies?: any[]; settings?: any }) {
    const newWorkflowId = await this.resolveNextWorkflowId();
    const [newWorkflow] = await this.db
      .insert(schema.workflows)
      .values({ id: newWorkflowId, name: data.name, description: data.description ?? null })
      .returning();
    await createBoard(this.boardSlug(newWorkflowId), newWorkflow.name);
    const newStageIds: number[] = [];
    for (const stage of data.stages) {
      const newStageId = await this.resolveNextStageId();
      newStageIds.push(newStageId);
      await this.db.insert(schema.workflowStages).values({
        id: newStageId, workflowId: newWorkflowId,
        titleTemplate: stage.titleTemplate, roleSlug: stage.roleSlug, roleLabel: stage.roleLabel,
        initialStatus: stage.initialStatus ?? 'todo', maxRuntime: stage.maxRuntime ?? null,
        maxRetries: stage.maxRetries ?? 2, skills: stage.skills ?? null, goalMode: stage.goalMode ?? false, sortOrder: stage.sortOrder ?? 0,
      });
    }
    if (data.dependencies) {
      for (const dep of data.dependencies) {
        const stageId = newStageIds[dep.childIndex];
        const parentId = newStageIds[dep.parentIndex];
        if (stageId && parentId) {
          const nextDepId = await this.resolveNextDepId();
          await this.db.insert(schema.stageDependencies).values({ id: nextDepId, stageId, parentId });
        }
      }
    }
    return this.findOne(newWorkflowId);
  }

  getTemplates() {
    return [
      { id: 'feature-dev', name: 'Feature Development', description: 'Full feature cycle: spec → backend → frontend → QA → deploy',
        stages: [
          { titleTemplate: 'Spec: {featureName}', roleLabel: 'Spec', roleSlug: 'spec', initialStatus: 'triage', sortOrder: 0 },
          { titleTemplate: 'Implement backend {featureName}', roleLabel: 'Backend', roleSlug: 'backend', initialStatus: 'todo', sortOrder: 1 },
          { titleTemplate: 'Implement frontend {featureName}', roleLabel: 'Frontend', roleSlug: 'frontend', initialStatus: 'todo', sortOrder: 2 },
          { titleTemplate: 'QA review {featureName}', roleLabel: 'QA', roleSlug: 'qa', initialStatus: 'todo', sortOrder: 3 },
          { titleTemplate: 'Deploy {featureName}', roleLabel: 'DevOps', roleSlug: 'devops', initialStatus: 'todo', sortOrder: 4 },
        ],
        dependencies: [{ parentIndex: 0, childIndex: 1 }, { parentIndex: 0, childIndex: 2 }, { parentIndex: 1, childIndex: 3 }, { parentIndex: 2, childIndex: 3 }, { parentIndex: 3, childIndex: 4 }],
      },
      { id: 'bug-fix', name: 'Bug Fix', description: 'Quick bug fix: reproduce → fix → verify',
        stages: [
          { titleTemplate: 'Reproduce bug: {bugTitle}', roleLabel: 'QA', roleSlug: 'qa', initialStatus: 'todo', sortOrder: 0 },
          { titleTemplate: 'Fix: {bugTitle}', roleLabel: 'Backend', roleSlug: 'backend', initialStatus: 'todo', sortOrder: 1 },
          { titleTemplate: 'Verify fix: {bugTitle}', roleLabel: 'QA', roleSlug: 'qa', initialStatus: 'todo', sortOrder: 2 },
        ],
        dependencies: [{ parentIndex: 0, childIndex: 1 }, { parentIndex: 1, childIndex: 2 }],
      },
      { id: 'code-review', name: 'Code Review', description: 'Review and merge: review → test → merge',
        stages: [
          { titleTemplate: 'Review PR #{prNumber}', roleLabel: 'QA', roleSlug: 'qa', initialStatus: 'todo', sortOrder: 0 },
          { titleTemplate: 'Test PR #{prNumber}', roleLabel: 'QA', roleSlug: 'qa', initialStatus: 'todo', sortOrder: 1 },
          { titleTemplate: 'Merge PR #{prNumber}', roleLabel: 'DevOps', roleSlug: 'devops', initialStatus: 'todo', sortOrder: 2 },
        ],
        dependencies: [{ parentIndex: 0, childIndex: 1 }, { parentIndex: 1, childIndex: 2 }],
      },
    ];
  }

  // ── Duplicate ──

  async duplicate(workflowId: number) {
    const original = await this.findWorkflowOrThrow(workflowId);

    const stages = await this.db
      .select()
      .from(schema.workflowStages)
      .where(eq(schema.workflowStages.workflowId, workflowId))
      .orderBy(asc(schema.workflowStages.sortOrder));

    const allDeps = await this.db
      .select()
      .from(schema.stageDependencies);

    const stageIds = new Set(stages.map((s) => s.id));
    const deps = allDeps.filter(
      (d) => stageIds.has(d.stageId) && stageIds.has(d.parentId),
    );

    const newWorkflowId = await this.resolveNextWorkflowId();
    const [newWorkflow] = await this.db
      .insert(schema.workflows)
      .values({
        id: newWorkflowId,
        name: `${original.name} (copy)`,
        description: original.description,
      })
      .returning();

    await createBoard(this.boardSlug(newWorkflowId), newWorkflow.name);

    const stageIdMap = new Map<number, number>();
    for (const stage of stages) {
      const newStageId = await this.resolveNextStageId();
      stageIdMap.set(stage.id, newStageId);
      await this.db.insert(schema.workflowStages).values({
        id: newStageId,
        workflowId: newWorkflowId,
        titleTemplate: stage.titleTemplate,
        roleSlug: stage.roleSlug,
        roleLabel: stage.roleLabel,
        initialStatus: stage.initialStatus,
        maxRuntime: stage.maxRuntime,
        maxRetries: stage.maxRetries,
        skills: stage.skills,
        goalMode: stage.goalMode,
        sortOrder: stage.sortOrder,
      });
    }

    for (const dep of deps) {
      const newStageId = stageIdMap.get(dep.stageId);
      const newParentId = stageIdMap.get(dep.parentId);
      if (newStageId && newParentId) {
        const nextDepId = await this.resolveNextDepId();
        await this.db.insert(schema.stageDependencies).values({
          id: nextDepId,
          stageId: newStageId,
          parentId: newParentId,
        });
      }
    }

    return this.findOne(newWorkflowId);
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
      this.boardGateway.broadcastRunComplete(workflowId, runId);
      this.boardGateway.broadcastBoardUpdate(workflowId);
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

    this.boardGateway.broadcastRunComplete(workflowId, runId);
    this.boardGateway.broadcastBoardUpdate(workflowId);
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

  private async resolveNextActivityId(): Promise<number> {
    const all = await this.db.select({ id: schema.activityLog.id }).from(schema.activityLog);
    if (all.length === 0) return 1;
    let maxId = 0;
    for (const r of all) { if (r.id > maxId) maxId = r.id; }
    return maxId + 1;
  }

  // ── Analytics ──

  async getAnalytics(workflowId: number) {
    await this.findWorkflowOrThrow(workflowId);
    const runs = await this.db
      .select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.workflowId, workflowId));

    const completed = runs.filter((r) => r.status === 'completed');
    const failed = runs.filter((r) => r.status === 'failed');
    const running = runs.filter((r) => r.status === 'running');
    const successRate = runs.length > 0 ? Math.round((completed.length / runs.length) * 100) : 0;

    let avgDurationSeconds = 0;
    if (completed.length > 0) {
      const totalDuration = completed.reduce((sum, r) => {
        if (r.completedAt && r.createdAt) {
          return sum + (new Date(r.completedAt).getTime() - new Date(r.createdAt).getTime()) / 1000;
        }
        return sum;
      }, 0);
      avgDurationSeconds = Math.round(totalDuration / completed.length);
    }

    // Runs per day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentRuns = runs.filter((r) => new Date(r.createdAt) >= thirtyDaysAgo);
    const runsPerDayMap = new Map<string, number>();
    for (const r of recentRuns) {
      const date = new Date(r.createdAt).toISOString().split('T')[0];
      runsPerDayMap.set(date, (runsPerDayMap.get(date) ?? 0) + 1);
    }
    const runsPerDay = Array.from(runsPerDayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalRuns: runs.length,
      completedRuns: completed.length,
      failedRuns: failed.length,
      runningRuns: running.length,
      successRate,
      avgDurationSeconds,
      runsPerDay,
    };
  }

  // ── Activity Log ──

  async logActivity(workflowId: number, action: string, entityType: string, entityId?: string, details?: any) {
    const nextId = await this.resolveNextActivityId();
    await this.db.insert(schema.activityLog).values({
      id: nextId,
      workflowId,
      action,
      entityType,
      entityId: entityId ?? null,
      details: details ?? null,
    });
  }

  async getActivityLogs(workflowId: number, limit = 50) {
    await this.findWorkflowOrThrow(workflowId);
    return this.db
      .select()
      .from(schema.activityLog)
      .where(eq(schema.activityLog.workflowId, workflowId))
      .orderBy(schema.activityLog.createdAt)
      .limit(limit);
  }

  // ── Versions ──

  async snapshotVersion(workflowId: number, changeSummary?: string) {
    const stages = await this.db.select().from(schema.workflowStages)
      .where(eq(schema.workflowStages.workflowId, workflowId))
      .orderBy(asc(schema.workflowStages.sortOrder));
    const allDeps = await this.db.select().from(schema.stageDependencies);
    const stageIds = new Set(stages.map((s) => s.id));
    const deps = allDeps.filter((d) => stageIds.has(d.stageId) && stageIds.has(d.parentId));

    const existingVersions = await this.db.select().from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.workflowId, workflowId));
    const nextVersion = existingVersions.length + 1;
    const nextId = await this.resolveNextVersionId();

    await this.db.insert(schema.workflowVersions).values({
      id: nextId, workflowId, version: nextVersion,
      stagesSnapshot: stages, depsSnapshot: deps,
      changeSummary: changeSummary ?? null,
    });
    return { version: nextVersion };
  }

  async getVersions(workflowId: number) {
    await this.findWorkflowOrThrow(workflowId);
    return this.db.select().from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.workflowId, workflowId))
      .orderBy(schema.workflowVersions.createdAt);
  }

  async getVersion(workflowId: number, versionId: number) {
    const [version] = await this.db.select().from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.id, versionId)).limit(1);
    if (!version) throw new NotFoundException(`Version ${versionId} not found`);
    return version;
  }

  // ── Webhook ──

  async getWebhook(workflowId: number) {
    const [config] = await this.db.select().from(schema.webhookConfigs)
      .where(eq(schema.webhookConfigs.workflowId, workflowId)).limit(1);
    return config ?? null;
  }

  async upsertWebhook(workflowId: number, data: { url: string; secret?: string; events?: string[]; isActive?: boolean }) {
    const existing = await this.getWebhook(workflowId);
    if (existing) {
      await this.db.update(schema.webhookConfigs).set({
        url: data.url, secret: data.secret ?? existing.secret,
        events: data.events ?? existing.events, isActive: data.isActive ?? existing.isActive,
      }).where(eq(schema.webhookConfigs.workflowId, workflowId));
    } else {
      const nextId = await this.resolveNextWebhookId();
      await this.db.insert(schema.webhookConfigs).values({
        id: nextId, workflowId, url: data.url, secret: data.secret ?? null,
        events: data.events ?? ['run.completed', 'run.failed'], isActive: data.isActive ?? true,
      });
    }
    return this.getWebhook(workflowId);
  }

  async triggerWebhook(workflowId: number, event: string, payload: Record<string, unknown>) {
    const config = await this.getWebhook(workflowId);
    if (!config || !config.isActive || !config.events?.includes(event)) return;
    try {
      const body = JSON.stringify({ event, workflowId, timestamp: new Date().toISOString(), ...payload });
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.secret) {
        const { createHmac } = await import('crypto');
        headers['X-Webhook-Signature'] = createHmac('sha256', config.secret).update(body).digest('hex');
      }
      await fetch(config.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
      this.logger.log(`Webhook triggered: ${event} → ${config.url}`);
    } catch (err: unknown) {
      this.logger.error(`Webhook failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Board Columns ──

  async getColumns(workflowId: number) {
    return this.db.select().from(schema.boardColumns)
      .where(eq(schema.boardColumns.workflowId, workflowId))
      .orderBy(schema.boardColumns.sortOrder);
  }

  async createColumn(workflowId: number, data: { key: string; label: string; color?: string }) {
    const nextId = await this.resolveNextColumnId();
    const maxSort = await this.db.select({ sortOrder: schema.boardColumns.sortOrder })
      .from(schema.boardColumns).where(eq(schema.boardColumns.workflowId, workflowId));
    const maxSortOrder = maxSort.reduce((max, r) => Math.max(max, r.sortOrder ?? 0), 0);
    return this.db.insert(schema.boardColumns).values({
      id: nextId, workflowId, key: data.key, label: data.label,
      color: data.color ?? '#6b7280', sortOrder: maxSortOrder + 1, isDefault: false,
    }).returning();
  }

  async deleteColumn(workflowId: number, columnId: number) {
    await this.db.delete(schema.boardColumns)
      .where(eq(schema.boardColumns.id, columnId));
    return { deleted: true };
  }

  // ── Search ──

  async searchWorkflows(query: string) {
    return this.db.select().from(schema.workflows)
      .where(query ? undefined : undefined)
      .limit(20);
  }

  private async resolveNextVersionId(): Promise<number> {
    const all = await this.db.select({ id: schema.workflowVersions.id }).from(schema.workflowVersions);
    if (all.length === 0) return 1;
    let maxId = 0;
    for (const r of all) { if (r.id > maxId) maxId = r.id; }
    return maxId + 1;
  }

  private async resolveNextWebhookId(): Promise<number> {
    const all = await this.db.select({ id: schema.webhookConfigs.id }).from(schema.webhookConfigs);
    if (all.length === 0) return 1;
    let maxId = 0;
    for (const r of all) { if (r.id > maxId) maxId = r.id; }
    return maxId + 1;
  }

  private async resolveNextColumnId(): Promise<number> {
    const all = await this.db.select({ id: schema.boardColumns.id }).from(schema.boardColumns);
    if (all.length === 0) return 1;
    let maxId = 0;
    for (const r of all) { if (r.id > maxId) maxId = r.id; }
    return maxId + 1;
  }

  // ── Tags ──

  async getTags(workflowId: number) {
    return this.db.select().from(schema.workflowTags)
      .where(eq(schema.workflowTags.workflowId, workflowId));
  }

  async addTag(workflowId: number, tag: string) {
    const nextId = await this.resolveNextTagId();
    await this.db.insert(schema.workflowTags).values({ id: nextId, workflowId, tag });
    return { tag };
  }

  async removeTag(workflowId: number, tag: string) {
    await this.db.delete(schema.workflowTags)
      .where(eq(schema.workflowTags.workflowId, workflowId));
    return { deleted: true };
  }

  async getAllTags() {
    const all = await this.db.select({ tag: schema.workflowTags.tag }).from(schema.workflowTags);
    return [...new Set(all.map((r) => r.tag))].sort();
  }

  // ── Favorites + Archive ──

  async toggleFavorite(workflowId: number) {
    const [wf] = await this.db.select().from(schema.workflows)
      .where(eq(schema.workflows.id, workflowId)).limit(1);
    if (!wf) throw new NotFoundException(`Workflow ${workflowId} not found`);
    const newVal = !wf.isFavorite;
    await this.db.update(schema.workflows).set({ isFavorite: newVal })
      .where(eq(schema.workflows.id, workflowId));
    return { isFavorite: newVal };
  }

  async toggleArchive(workflowId: number) {
    const [wf] = await this.db.select().from(schema.workflows)
      .where(eq(schema.workflows.id, workflowId)).limit(1);
    if (!wf) throw new NotFoundException(`Workflow ${workflowId} not found`);
    const newVal = !wf.isArchived;
    await this.db.update(schema.workflows).set({ isArchived: newVal })
      .where(eq(schema.workflows.id, workflowId));
    return { isArchived: newVal };
  }

  async findAllFiltered(filters?: { favorite?: boolean; archived?: boolean }) {
    let results = await this.db.select().from(schema.workflows)
      .orderBy(schema.workflows.isFavorite, asc(schema.workflows.createdAt));
    if (filters?.favorite) results = results.filter((r) => r.isFavorite);
    if (filters?.archived === false) results = results.filter((r) => !r.isArchived);
    if (filters?.archived === true) results = results.filter((r) => r.isArchived);
    return results;
  }

  // ── Gantt ──

  async getGantt(workflowId: number) {
    await this.findWorkflowOrThrow(workflowId);
    const stages = await this.db.select().from(schema.workflowStages)
      .where(eq(schema.workflowStages.workflowId, workflowId))
      .orderBy(asc(schema.workflowStages.sortOrder));
    const allDeps = await this.db.select().from(schema.stageDependencies);
    const stageIds = new Set(stages.map((s) => s.id));
    const deps = allDeps.filter((d) => stageIds.has(d.stageId) && stageIds.has(d.parentId));

    // Calculate start/end days based on dependencies
    const dayMap = new Map<number, { start: number; end: number }>();
    for (const stage of stages) {
      const parentDeps = deps.filter((d) => d.stageId === stage.id);
      if (parentDeps.length === 0) {
        dayMap.set(stage.id, { start: 0, end: 1 });
      } else {
        const maxEnd = Math.max(...parentDeps.map((d) => dayMap.get(d.parentId)?.end ?? 0));
        dayMap.set(stage.id, { start: maxEnd, end: maxEnd + 1 });
      }
    }

    const totalDays = Math.max(...Array.from(dayMap.values()).map((d) => d.end), 1);

    return {
      stages: stages.map((s) => ({
        id: s.id,
        label: s.roleLabel,
        titleTemplate: s.titleTemplate,
        startDay: dayMap.get(s.id)?.start ?? 0,
        endDay: dayMap.get(s.id)?.end ?? 1,
        assignee: s.roleSlug,
      })),
      dependencies: deps.map((d) => ({ from: d.parentId, to: d.stageId })),
      totalDays,
    };
  }

  // ── Time Tracking ──

  async getTimeLogs(workflowId: number) {
    return this.db.select().from(schema.taskTimeLogs)
      .where(eq(schema.taskTimeLogs.workflowId, workflowId))
      .orderBy(schema.taskTimeLogs.startedAt);
  }

  async startTimeLog(workflowId: number, taskId: string) {
    const nextId = await this.resolveNextTimeLogId();
    await this.db.insert(schema.taskTimeLogs).values({
      id: nextId, workflowId, taskId, startedAt: new Date(),
    });
  }

  async completeTimeLog(taskId: string) {
    const [log] = await this.db.select().from(schema.taskTimeLogs)
      .where(eq(schema.taskTimeLogs.taskId, taskId)).limit(1);
    if (log && !log.completedAt) {
      const now = new Date();
      const duration = Math.round((now.getTime() - new Date(log.startedAt).getTime()) / 1000);
      await this.db.update(schema.taskTimeLogs).set({
        completedAt: now, durationSeconds: duration,
      }).where(eq(schema.taskTimeLogs.id, log.id));
    }
  }

  private async resolveNextTagId(): Promise<number> {
    const all = await this.db.select({ id: schema.workflowTags.id }).from(schema.workflowTags);
    if (all.length === 0) return 1;
    let maxId = 0;
    for (const r of all) { if (r.id > maxId) maxId = r.id; }
    return maxId + 1;
  }

  private async resolveNextTimeLogId(): Promise<number> {
    const all = await this.db.select({ id: schema.taskTimeLogs.id }).from(schema.taskTimeLogs);
    if (all.length === 0) return 1;
    let maxId = 0;
    for (const r of all) { if (r.id > maxId) maxId = r.id; }
    return maxId + 1;
  }

  private async resolveNextSettingsId(): Promise<number> {
    const all = await this.db.select({ id: schema.workflowSettings.id }).from(schema.workflowSettings);
    if (all.length === 0) return 1;
    let maxId = 0;
    for (const r of all) { if (r.id > maxId) maxId = r.id; }
    return maxId + 1;
  }

  // ── Version Comparison ──

  async compareVersions(workflowId: number, v1: number, v2: number) {
    const versions = await this.db.select().from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.workflowId, workflowId));
    const version1 = versions.find((v) => v.version === v1);
    const version2 = versions.find((v) => v.version === v2);
    if (!version1 || !version2) throw new NotFoundException('Version not found');

    const stages1 = (version1.stagesSnapshot as any[]) ?? [];
    const stages2 = (version2.stagesSnapshot as any[]) ?? [];

    const map1 = new Map(stages1.map((s: any) => [s.roleSlug, s]));
    const map2 = new Map(stages2.map((s: any) => [s.roleSlug, s]));

    const added = stages2.filter((s: any) => !map1.has(s.roleSlug));
    const removed = stages1.filter((s: any) => !map2.has(s.roleSlug));
    const unchanged: any[] = [];
    const changed: { before: any; after: any; diff: string[] }[] = [];

    for (const [slug, s2] of map2) {
      const s1 = map1.get(slug);
      if (!s1) continue;
      const diffs: string[] = [];
      for (const key of ['titleTemplate', 'roleLabel', 'initialStatus', 'maxRuntime', 'maxRetries', 'goalMode']) {
        if (JSON.stringify(s1[key]) !== JSON.stringify(s2[key])) diffs.push(key);
      }
      if (diffs.length > 0) changed.push({ before: s1, after: s2, diff: diffs });
      else unchanged.push(s2);
    }

    return {
      version1: { id: version1.id, version: v1, createdAt: version1.createdAt },
      version2: { id: version2.id, version: v2, createdAt: version2.createdAt },
      added, removed, changed, unchanged,
    };
  }

  // ── Batch Export ──

  async exportAll() {
    const workflows = await this.db.select().from(schema.workflows);
    const result: any[] = [];
    for (const wf of workflows) {
      result.push(await this.exportWorkflow(wf.id));
    }
    return result;
  }
}
