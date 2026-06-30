import { execFile } from 'child_process';
import { promisify } from 'util';
import { Logger } from '@nestjs/common';

const execFileAsync = promisify(execFile);
const logger = new Logger('KanbanClient');

const VALID_PARAM_RE = /^[a-zA-Z0-9 _\-.,:;!?()[\]{}\n\r\t]+$/;

function assertSafe(value: string, fieldName: string): void {
  if (!VALID_PARAM_RE.test(value)) {
    throw new Error(
      `Invalid characters in ${fieldName}: "${value.slice(0, 50)}..."`,
    );
  }
}

export interface CreateTaskOptions {
  title: string;
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
 * Create a kanban task via `hermes kanban create`.
 * Returns the created task ID.
 */
export async function createKanbanTask(
  options: CreateTaskOptions,
): Promise<string> {
  assertSafe(options.title, 'title');

  const args = ['kanban', 'create', options.title, '--json'];

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
  if (options.maxRuntime !== undefined) {
    args.push('--max-runtime', String(options.maxRuntime));
  }
  if (options.maxRetries !== undefined) {
    args.push('--max-retries', String(options.maxRetries));
  }
  if (options.goalMode) {
    args.push('--goal-mode');
  }
  if (options.workdir) {
    assertSafe(options.workdir, 'workdir');
    args.push('--workdir', options.workdir);
  }

  logger.log(`Creating kanban task: ${options.title}`);

  try {
    const { stdout } = await execFileAsync('hermes', args, {
      timeout: 30_000,
      env: { ...process.env },
    });

    const parsed = JSON.parse(stdout.trim());
    const taskId = String(parsed.id ?? parsed.taskId ?? parsed);
    logger.log(`Task created: ${taskId}`);
    return taskId;
  } catch (err: any) {
    logger.error(`Failed to create kanban task: ${err.message}`);
    throw new Error(`Kanban task creation failed: ${err.message}`);
  }
}

/**
 * Set parent dependencies for a kanban task.
 * Uses `hermes kanban update <id> --parent <p1> --parent <p2> ...`
 */
export async function setTaskParents(
  taskId: string,
  parentIds: string[],
): Promise<void> {
  assertSafe(taskId, 'taskId');

  if (parentIds.length === 0) return;

  const args = ['kanban', 'update', taskId];
  for (const parentId of parentIds) {
    assertSafe(parentId, 'parentId');
    args.push('--parent', parentId);
  }

  logger.log(
    `Setting parents for task ${taskId}: [${parentIds.join(', ')}]`,
  );

  try {
    await execFileAsync('hermes', args, {
      timeout: 15_000,
      env: { ...process.env },
    });
    logger.log(`Parents set for task ${taskId}`);
  } catch (err: any) {
    logger.error(`Failed to set parents for task ${taskId}: ${err.message}`);
    throw new Error(`Setting parents failed: ${err.message}`);
  }
}
