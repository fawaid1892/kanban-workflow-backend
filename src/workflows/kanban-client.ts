import { execFile } from 'child_process';
import { promisify } from 'util';
import { Logger } from '@nestjs/common';
import { existsSync } from 'fs';

const execFileAsync = promisify(execFile);
const logger = new Logger('KanbanClient');

let hermesAvailable: boolean | null = null;

function isHermesAvailable(): boolean {
  if (hermesAvailable === null) {
    hermesAvailable =
      existsSync('/usr/local/bin/hermes') || existsSync('/usr/bin/hermes');
  }
  return hermesAvailable;
}

const VALID_PARAM_RE = /^[a-zA-Z0-9 _\-.,:;!?()[\]{}\\n\\r\\t]+$/;

function assertSafe(value: string, fieldName: string): void {
  if (!VALID_PARAM_RE.test(value)) {
    throw new Error(`Invalid characters in ${fieldName}: "${value.slice(0, 50)}..."`);
  }
}

export interface CreateTaskOptions {
  title: string;
  board: string;
  assignee?: string;
  status?: string;
  goal?: string;
  skills?: string[];
  maxRuntime?: number;
  maxRetries?: number;
  goalMode?: boolean;
  workdir?: string;
}

/**
 * Create a kanban task on a specific board via `hermes kanban create --board`.
 * Returns the created task ID.
 */
export async function createKanbanTask(options: CreateTaskOptions): Promise<string> {
  if (!isHermesAvailable()) {
    logger.warn('hermes binary not found — skipping task creation');
    return `mock-${Date.now()}`;
  }

  assertSafe(options.title, 'title');
  assertSafe(options.board, 'board');

  const args = ['kanban', 'create', options.title, '--board', options.board, '--json'];

  if (options.assignee) {
    assertSafe(options.assignee, 'assignee');
    args.push('--assignee', options.assignee);
  }
  if (options.status) {
    assertSafe(options.status, 'status');
    args.push('--status', options.status);
  }
  if (options.goal) {
    assertSafe(options.goal, 'goal');
    args.push('--goal', options.goal);
  }
  if (options.skills && options.skills.length > 0) {
    for (const skill of options.skills) {
      assertSafe(skill, 'skill');
      args.push('--skill', skill);
    }
  }
  if (options.maxRuntime !== undefined) args.push('--max-runtime', String(options.maxRuntime));
  if (options.maxRetries !== undefined) args.push('--max-retries', String(options.maxRetries));
  if (options.goalMode) args.push('--goal-mode');

  logger.log(`Creating kanban task: ${options.title} on board ${options.board}`);

  try {
    const { stdout } = await execFileAsync('hermes', args, {
      timeout: 30_000,
      env: { ...process.env },
    });
    const parsed = JSON.parse(stdout.trim());
    const taskId = String(parsed.id ?? parsed.taskId ?? parsed);
    logger.log(`Task created: ${taskId}`);
    return taskId;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to create kanban task: ${message}`);
    throw new Error(`Kanban task creation failed: ${message}`);
  }
}

/**
 * Set parent dependencies for a kanban task on a specific board.
 */
export async function setTaskParents(
  taskId: string,
  parentIds: string[],
  board: string,
): Promise<void> {
  if (!isHermesAvailable()) {
    logger.warn('hermes binary not found — skipping setTaskParents');
    return;
  }

  assertSafe(taskId, 'taskId');
  assertSafe(board, 'board');

  if (parentIds.length === 0) return;

  const args = ['kanban', 'link', '--board', board, taskId];
  for (const parentId of parentIds) {
    assertSafe(parentId, 'parentId');
    args.push('--parent', parentId);
  }

  logger.log(`Setting parents for task ${taskId}: [${parentIds.join(', ')}]`);

  try {
    await execFileAsync('hermes', args, {
      timeout: 15_000,
      env: { ...process.env },
    });
    logger.log(`Parents set for task ${taskId}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to set parents for task ${taskId}: ${message}`);
    throw new Error(`Setting parents failed: ${message}`);
  }
}

/**
 * Create a Hermes board via `hermes kanban boards create`.
 */
export async function createBoard(slug: string, name: string): Promise<void> {
  if (!isHermesAvailable()) {
    logger.warn('hermes binary not found — skipping board creation');
    return;
  }

  assertSafe(slug, 'board slug');

  try {
    await execFileAsync('hermes', ['kanban', 'boards', 'create', slug, '--json'], {
      timeout: 10_000,
      env: { ...process.env },
    });
    logger.log(`Board created: ${slug}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Board might already exist — that's fine
    logger.warn(`Board creation note: ${message}`);
  }
}

/**
 * Create a Hermes profile via `hermes profile create`.
 */
export async function createProfile(slug: string): Promise<void> {
  if (!isHermesAvailable()) {
    logger.warn('hermes binary not found — skipping profile creation');
    return;
  }

  assertSafe(slug, 'profile slug');

  try {
    await execFileAsync('hermes', ['profile', 'create', slug, '--clone'], {
      timeout: 10_000,
      env: { ...process.env },
    });
    logger.log(`Profile created: ${slug}`);
  } catch (err: unknown) {
    logger.warn(`Profile creation note: ${err instanceof Error ? err.message : String(err)}`);
  }
}
