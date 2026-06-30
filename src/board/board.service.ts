import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

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

export interface TaskEvent {
  id: number;
  taskId: string;
  runId: string | null;
  kind: string;
  payload: string | null;
  createdAt: number;
}

export interface TaskComment {
  id: number;
  taskId: string;
  author: string;
  body: string;
  createdAt: number;
}

export interface TaskDetail extends BoardTask {
  events: TaskEvent[];
  comments: TaskComment[];
  parentIds: string[];
  childIds: string[];
}

export interface BoardStats {
  total: number;
  byStatus: Record<string, number>;
  byAssignee: Record<string, number>;
}

@Injectable()
export class BoardService implements OnModuleDestroy {
  private readonly logger = new Logger(BoardService.name);
  private db: Database.Database | null = null;

  // Simple TTL cache for kanban.db reads
  private cache = new Map<string, { data: any; expiresAt: number }>();
  private readonly cacheTtlMs = 3000; // 3 seconds

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() < entry.expiresAt) {
      return entry.data as T;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, expiresAt: Date.now() + this.cacheTtlMs });
  }

  private getDb(): Database.Database {
    if (!this.db) {
      const dbPath = join(homedir(), '.hermes', 'kanban.db');
      if (!existsSync(dbPath)) {
        throw new Error(`Kanban database not found at ${dbPath}`);
      }
      this.db = new Database(dbPath, { readonly: true });
      this.logger.log(`Connected to kanban.db at ${dbPath}`);
    }
    return this.db;
  }

  onModuleDestroy() {
    if (this.db) {
      this.db.close();
    }
  }

  /**
   * List tasks with optional filters.
   */
  getTasks(filters?: {
    status?: string;
    assignee?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): BoardTask[] {
    const cacheKey = `tasks:${JSON.stringify(filters ?? {})}`;
    const cached = this.getCached<BoardTask[]>(cacheKey);
    if (cached) return cached;

    const db = this.getDb();
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters?.assignee) {
      query += ' AND assignee = ?';
      params.push(filters.assignee);
    }
    if (filters?.search) {
      query += ' AND (title LIKE ? OR body LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    if (filters?.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const rows = db.prepare(query).all(...params) as any[];
    const result = rows.map(this.mapTask);
    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get task detail with events, comments, and links.
   */
  getTaskDetail(taskId: string): TaskDetail | null {
    const db = this.getDb();

    const task = db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(taskId) as any;
    if (!task) return null;

    const events = db
      .prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId) as any[];

    const comments = db
      .prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId) as any[];

    const parentLinks = db
      .prepare('SELECT parent_id FROM task_links WHERE child_id = ?')
      .all(taskId) as any[];

    const childLinks = db
      .prepare('SELECT child_id FROM task_links WHERE parent_id = ?')
      .all(taskId) as any[];

    return {
      ...this.mapTask(task),
      events: events.map((e) => ({
        id: e.id,
        taskId: e.task_id,
        runId: e.run_id,
        kind: e.kind,
        payload: e.payload,
        createdAt: e.created_at,
      })),
      comments: comments.map((c) => ({
        id: c.id,
        taskId: c.task_id,
        author: c.author,
        body: c.body,
        createdAt: c.created_at,
      })),
      parentIds: parentLinks.map((l) => l.parent_id),
      childIds: childLinks.map((l) => l.child_id),
    };
  }

  /**
   * Get board stats: counts by status and assignee.
   */
  getStats(): BoardStats {
    const cached = this.getCached<BoardStats>('stats');
    if (cached) return cached;

    const db = this.getDb();

    const total = (db.prepare('SELECT COUNT(*) as cnt FROM tasks').get() as any).cnt;

    const statusRows = db
      .prepare('SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status')
      .all() as any[];

    const assigneeRows = db
      .prepare('SELECT assignee, COUNT(*) as cnt FROM tasks GROUP BY assignee')
      .all() as any[];

    const byStatus: Record<string, number> = {};
    for (const row of statusRows) {
      byStatus[row.status] = row.cnt;
    }

    const byAssignee: Record<string, number> = {};
    for (const row of assigneeRows) {
      byAssignee[row.assignee] = row.cnt;
    }

    const result: BoardStats = { total, byStatus, byAssignee };
    this.setCache('stats', result);
    return result;
  }

  private mapTask(row: any): BoardTask {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      assignee: row.assignee,
      status: row.status,
      priority: row.priority,
      createdBy: row.created_by,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      workspaceKind: row.workspace_kind,
      branchName: row.branch_name,
      projectId: row.project_id,
      result: row.result,
      skills: row.skills ? JSON.parse(row.skills) : [],
      maxRetries: row.max_retries,
      goalMode: !!row.goal_mode,
      sessionId: row.session_id,
      workflowTemplateId: row.workflow_template_id,
      currentStepKey: row.current_step_key,
    };
  }
}
