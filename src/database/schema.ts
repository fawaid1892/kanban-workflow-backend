import {
  pgTable,
  bigint,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';

// ── Role registry (mirror Hermes profile + Podman sandbox config) ──
export const roles = pgTable('roles', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  color: text('color').default('#6366f1').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  // Sandbox config
  sandboxImage: text('sandbox_image').default('node:20-alpine').notNull(),
  sandboxNetwork: text('sandbox_network').default('none').notNull(),
  sandboxMemory: text('sandbox_memory').default('512m').notNull(),
  sandboxCpu: text('sandbox_cpu').default('0.5').notNull(),
  sandboxTimeout: integer('sandbox_timeout').default(7200).notNull(),
  preCacheDeps: boolean('pre_cache_deps').default(true).notNull(),
  // Model config
  modelMode: text('model_mode').default('shared').notNull(),
  modelProvider: text('model_provider'),
  modelName: text('model_name'),
  modelTemperature: real('model_temperature').default(0.7),
  modelMaxTokens: integer('model_max_tokens').default(4096),
  modelSystemPrompt: text('model_system_prompt'),
  modelMaxTurns: integer('model_max_turns').default(20),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ── Podman image build history per role ──
export const sandboxBuilds = pgTable('sandbox_builds', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  roleSlug: text('role_slug')
    .references(() => roles.slug, { onDelete: 'cascade' })
    .notNull(),
  imageTag: text('image_tag').notNull(),
  status: text('status').default('building').notNull(),
  logOutput: text('log_output'),
  errorMessage: text('error_message'),
  builtAt: timestamp('built_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Workflow template ──
export const workflows = pgTable('workflows', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ── Stage node dalam workflow ──
export const workflowStages = pgTable('workflow_stages', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  workflowId: bigint('workflow_id', { mode: 'number' })
    .references(() => workflows.id, { onDelete: 'cascade' })
    .notNull(),
  titleTemplate: text('title_template').notNull(),
  assigneeSlug: text('assignee_slug').references(() => roles.slug),
  initialStatus: text('initial_status').default('todo').notNull(),
  workspaceKind: text('workspace_kind').default('scratch').notNull(),
  maxRuntime: integer('max_runtime'),
  maxRetries: integer('max_retries').default(2),
  skills: text('skills').array(),
  goalMode: boolean('goal_mode').default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ── Multi-parent dependencies antar stage ──
export const stageDependencies = pgTable(
  'stage_dependencies',
  {
    id: bigint('id', { mode: 'number' }).primaryKey(),
    stageId: bigint('stage_id', { mode: 'number' })
      .references(() => workflowStages.id, { onDelete: 'cascade' })
      .notNull(),
    parentId: bigint('parent_id', { mode: 'number' })
      .references(() => workflowStages.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => ({
    uniq: unique('stage_parent_uniq').on(t.stageId, t.parentId),
  }),
);

// ── Run history ──
export const workflowRuns = pgTable('workflow_runs', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  workflowId: bigint('workflow_id', { mode: 'number' }).references(
    () => workflows.id,
  ),
  params: jsonb('params'),
  taskIds: text('task_ids').array(),
  status: text('status').default('running').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
