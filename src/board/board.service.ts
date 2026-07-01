import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const execFileAsync = promisify(execFile);

export interface BoardTask {
  id: string;
  title: string;
  body: string | null;
  assignee: string;
  status: string;
  priority: number;
  createdBy: string;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  workspaceKind: string | null;
  branchName: string | null;
  projectId: string | null;
  result: string | null;
  skills: string[];
  maxRetries: number | null;
  goalMode: boolean;
  sessionId: string | null;
  workflowTemplateId: string | null;
  currentStepKey: string | null;
}

export interface TaskDetail extends BoardTask {
  events: { id: number; taskId: string; runId: string | null; kind: string; payload: string | null; createdAt: number }[];
  comments: { id: number; taskId: string; author: string; body: string; createdAt: number }[];
  parentIds: string[];
  childIds: string[];
}

export interface BoardStats {
  total: number;
  byStatus: Record<string, number>;
  byAssignee: Record<string, number>;
}

@Injectable()
export class BoardService {
  private readonly logger = new Logger(BoardService.name);

  private hermesAvailable =
    existsSync('/usr/local/bin/hermes') || existsSync('/usr/bin/hermes');

  // TTL cache
  private cache = new Map<string, { data: unknown; expiresAt: number }>();
  private readonly cacheTtlMs = 3000;

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() < entry.expiresAt) return entry.data as T;
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, expiresAt: Date.now() + this.cacheTtlMs });
  }

  private boardSlug(workflowId: number): string {
    return `wf-${workflowId}`;
  }

  async getTasks(workflowId: number, filters?: {
    status?: string;
    assignee?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<BoardTask[]> {
    if (!this.hermesAvailable) return [];

    const cacheKey = `tasks:${workflowId}:${JSON.stringify(filters ?? {})}`;
    const cached = this.getCached<BoardTask[]>(cacheKey);
    if (cached) return cached;

    try {
      const args = ['kanban', 'list', '--board', this.boardSlug(workflowId), '--json'];
      if (filters?.status) args.push('--status', filters.status);

      const { stdout } = await execFileAsync('hermes', args, {
        timeout: 15_000,
        env: { ...process.env },
      });

      let tasks: BoardTask[] = JSON.parse(stdout.trim()).map(this.mapTask);

      if (filters?.assignee) {
        tasks = tasks.filter((t) => t.assignee === filters.assignee);
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        tasks = tasks.filter(
          (t) => t.title.toLowerCase().includes(q) || (t.body && t.body.toLowerCase().includes(q)),
        );
      }

      const offset = filters?.offset ?? 0;
      const limit = filters?.limit ?? 200;
      tasks = tasks.slice(offset, offset + limit);

      this.setCache(cacheKey, tasks);
      return tasks;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to list board tasks: ${message}`);
      return [];
    }
  }

  async getTaskDetail(workflowId: number, taskId: string): Promise<TaskDetail | null> {
    try {
      const { stdout } = await execFileAsync(
        'hermes',
        ['kanban', 'get', taskId, '--board', this.boardSlug(workflowId), '--json'],
        { timeout: 10_000, env: { ...process.env } },
      );

      const raw = JSON.parse(stdout.trim());
      return {
        ...this.mapTask(raw),
        events: (raw.events ?? []).map((e: Record<string, unknown>) => ({
          id: e.id as number,
          taskId: e.task_id as string,
          runId: (e.run_id as string) ?? null,
          kind: e.kind as string,
          payload: (e.payload as string) ?? null,
          createdAt: e.created_at as number,
        })),
        comments: (raw.comments ?? []).map((c: Record<string, unknown>) => ({
          id: c.id as number,
          taskId: c.task_id as string,
          author: c.author as string,
          body: c.body as string,
          createdAt: c.created_at as number,
        })),
        parentIds: (raw.parent_ids ?? []) as string[],
        childIds: (raw.child_ids ?? []) as string[],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to get task ${taskId}: ${message}`);
      return null;
    }
  }

  async getStats(workflowId: number): Promise<BoardStats> {
    const cached = this.getCached<BoardStats>(`stats:${workflowId}`);
    if (cached) return cached;

    const tasks = await this.getTasks(workflowId, { limit: 1000 });

    const byStatus: Record<string, number> = {};
    const byAssignee: Record<string, number> = {};

    for (const t of tasks) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      byAssignee[t.assignee] = (byAssignee[t.assignee] ?? 0) + 1;
    }

    const result: BoardStats = { total: tasks.length, byStatus, byAssignee };
    this.setCache(`stats:${workflowId}`, result);
    return result;
  }

  async updateTaskStatus(workflowId: number, taskId: string, status: string): Promise<{ ok: boolean }> {
    if (!this.hermesAvailable) return { ok: false };
    try {
      await execFileAsync('hermes', ['kanban', 'update', taskId, '--board', this.boardSlug(workflowId), '--status', status], {
        timeout: 10_000,
        env: { ...process.env },
      });
      this.cache.delete(`tasks:${workflowId}:*`);
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to update task status: ${message}`);
      return { ok: false };
    }
  }

  async addComment(workflowId: number, taskId: string, body: string, author: string): Promise<{ ok: boolean }> {
    if (!this.hermesAvailable) return { ok: false };
    try {
      await execFileAsync('hermes', ['kanban', 'comment', taskId, '--board', this.boardSlug(workflowId), '--author', author, '--body', body], {
        timeout: 10_000,
        env: { ...process.env },
      });
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to add comment: ${message}`);
      return { ok: false };
    }
  }

  async bulkUpdateStatus(workflowId: number, taskIds: string[], status: string): Promise<{ updated: number }> {
    if (!this.hermesAvailable) return { updated: 0 };
    let updated = 0;
    for (const taskId of taskIds) {
      try {
        await execFileAsync('hermes', ['kanban', 'update', taskId, '--board', this.boardSlug(workflowId), '--status', status], {
          timeout: 10_000,
          env: { ...process.env },
        });
        updated++;
      } catch (err: unknown) {
        this.logger.error(`Failed to update task ${taskId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this.cache.clear();
    return { updated };
  }

  async updateTaskPriority(workflowId: number, taskId: string, priority: number): Promise<{ ok: boolean }> {
    if (!this.hermesAvailable) return { ok: false };
    try {
      await execFileAsync('hermes', ['kanban', 'update', taskId, '--board', this.boardSlug(workflowId), '--priority', String(priority)], {
        timeout: 10_000,
        env: { ...process.env },
      });
      this.cache.clear();
      return { ok: true };
    } catch (err: unknown) {
      this.logger.error(`Failed to update priority: ${err instanceof Error ? err.message : String(err)}`);
      return { ok: false };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapTask(raw: any): BoardTask {
    return {
      id: raw.id,
      title: raw.title,
      body: raw.body ?? null,
      assignee: raw.assignee ?? 'unassigned',
      status: raw.status ?? 'unknown',
      priority: raw.priority ?? 0,
      createdBy: raw.created_by ?? 'unknown',
      createdAt: raw.created_at ?? 0,
      startedAt: raw.started_at ?? null,
      completedAt: raw.completed_at ?? null,
      workspaceKind: raw.workspace_kind ?? null,
      branchName: raw.branch_name ?? null,
      projectId: raw.project_id ?? null,
      result: raw.result ?? null,
      skills: Array.isArray(raw.skills) ? raw.skills : [],
      maxRetries: raw.max_retries ?? null,
      goalMode: !!raw.goal_mode,
      sessionId: raw.session_id ?? null,
      workflowTemplateId: raw.workflow_template_id ?? null,
      currentStepKey: raw.current_step_key ?? null,
    };
  }
}
