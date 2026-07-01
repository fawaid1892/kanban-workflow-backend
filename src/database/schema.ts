import {
  pgTable,
  bigint,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
  index,
} from 'drizzle-orm/pg-core';

// ── Workflow (project) ──
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

// ── Stage node (role = node) ──
export const workflowStages = pgTable('workflow_stages', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  workflowId: bigint('workflow_id', { mode: 'number' })
    .references(() => workflows.id, { onDelete: 'cascade' })
    .notNull(),
  titleTemplate: text('title_template').notNull(),
  roleSlug: text('role_slug').notNull(),
  roleLabel: text('role_label').notNull(),
  initialStatus: text('initial_status').default('todo').notNull(),
  maxRuntime: integer('max_runtime'),
  maxRetries: integer('max_retries').default(2),
  skills: text('skills').array(),
  goalMode: boolean('goal_mode').default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (t) => ({
  workflowIdIdx: index('workflow_stages_workflow_id_idx').on(t.workflowId),
}));

// ── Dependencies between stages ──
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
    stageIdIdx: index('stage_dependencies_stage_id_idx').on(t.stageId),
    parentIdIdx: index('stage_dependencies_parent_id_idx').on(t.parentId),
  }),
);

// ── Run history ──
export const workflowRuns = pgTable('workflow_runs', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  workflowId: bigint('workflow_id', { mode: 'number' }).references(
    () => workflows.id,
    { onDelete: 'cascade' },
  ),
  params: jsonb('params'),
  taskIds: text('task_ids').array(),
  status: text('status').default('running').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => ({
  workflowIdIdx: index('workflow_runs_workflow_id_idx').on(t.workflowId),
  statusIdx: index('workflow_runs_status_idx').on(t.status),
}));

// ── Settings per workflow ──
export const workflowSettings = pgTable('workflow_settings', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  workflowId: bigint('workflow_id', { mode: 'number' })
    .references(() => workflows.id, { onDelete: 'cascade' })
    .unique()
    .notNull(),
  baseUrl: text('base_url').notNull(),
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  chatSchema: text('chat_schema').default('chat-completions').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ── Activity Log / Audit Trail ──
export const activityLog = pgTable('activity_log', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  workflowId: bigint('workflow_id', { mode: 'number' })
    .references(() => workflows.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (t) => ({
  workflowIdIdx: index('activity_log_workflow_id_idx').on(t.workflowId),
}));
