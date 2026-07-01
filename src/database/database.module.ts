import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DRIZZLE = 'DRIZZLE';

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS "workflows" (
  "id" bigint PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "workflow_stages" (
  "id" bigint PRIMARY KEY NOT NULL,
  "workflow_id" bigint NOT NULL,
  "title_template" text NOT NULL,
  "role_slug" text NOT NULL,
  "role_label" text NOT NULL,
  "initial_status" text DEFAULT 'todo' NOT NULL,
  "max_runtime" integer,
  "max_retries" integer DEFAULT 2,
  "skills" text[],
  "goal_mode" boolean DEFAULT false,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "stage_dependencies" (
  "id" bigint PRIMARY KEY NOT NULL,
  "stage_id" bigint NOT NULL,
  "parent_id" bigint NOT NULL,
  CONSTRAINT "stage_parent_uniq" UNIQUE("stage_id","parent_id")
);

CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id" bigint PRIMARY KEY NOT NULL,
  "workflow_id" bigint,
  "params" jsonb,
  "task_ids" text[],
  "status" text DEFAULT 'running' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "workflow_settings" (
  "id" bigint PRIMARY KEY NOT NULL,
  "workflow_id" bigint NOT NULL,
  "base_url" text NOT NULL,
  "api_key_encrypted" text NOT NULL,
  "chat_schema" text DEFAULT 'chat-completions' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workflow_settings_workflow_id_unique" UNIQUE("workflow_id")
);

DO $$ BEGIN
  ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_workflow_id_workflows_id_fk"
    FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "stage_dependencies" ADD CONSTRAINT "stage_dependencies_stage_id_workflow_stages_id_fk"
    FOREIGN KEY ("stage_id") REFERENCES "workflow_stages"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "stage_dependencies" ADD CONSTRAINT "stage_dependencies_parent_id_workflow_stages_id_fk"
    FOREIGN KEY ("parent_id") REFERENCES "workflow_stages"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk"
    FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "workflow_settings" ADD CONSTRAINT "workflow_settings_workflow_id_workflows_id_fk"
    FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migrate existing data if tables existed before
DO $$ BEGIN
  -- Add role_slug and role_label columns if missing (from old schema)
  ALTER TABLE "workflow_stages" ADD COLUMN IF NOT EXISTS "role_slug" text DEFAULT 'backend';
  ALTER TABLE "workflow_stages" ADD COLUMN IF NOT EXISTS "role_label" text DEFAULT 'Backend';
  -- Remove old assignee_slug column if exists
  ALTER TABLE "workflow_stages" DROP COLUMN IF EXISTS "assignee_slug";
  ALTER TABLE "workflow_stages" DROP COLUMN IF EXISTS "workspace_kind";
  -- Add new columns to workflows
  ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "notes" text;
  ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "is_favorite" boolean DEFAULT false;
  ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "is_archived" boolean DEFAULT false;
EXCEPTION WHEN others THEN NULL;
END $$;

-- New tables for Sprint 7-11 features
CREATE TABLE IF NOT EXISTS "activity_log" (
  "id" bigint PRIMARY KEY NOT NULL,
  "workflow_id" bigint REFERENCES "workflows"("id") ON DELETE cascade,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text,
  "details" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "activity_log_workflow_id_idx" ON "activity_log" ("workflow_id");

CREATE TABLE IF NOT EXISTS "workflow_versions" (
  "id" bigint PRIMARY KEY NOT NULL,
  "workflow_id" bigint REFERENCES "workflows"("id") ON DELETE cascade,
  "version" integer NOT NULL,
  "stages_snapshot" jsonb NOT NULL,
  "deps_snapshot" jsonb NOT NULL,
  "change_summary" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "workflow_versions_workflow_id_idx" ON "workflow_versions" ("workflow_id");

CREATE TABLE IF NOT EXISTS "webhook_configs" (
  "id" bigint PRIMARY KEY NOT NULL,
  "workflow_id" bigint REFERENCES "workflows"("id") ON DELETE cascade UNIQUE,
  "url" text NOT NULL,
  "secret" text,
  "events" text[] DEFAULT ARRAY['run.completed','run.failed'],
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "board_columns" (
  "id" bigint PRIMARY KEY NOT NULL,
  "workflow_id" bigint REFERENCES "workflows"("id") ON DELETE cascade,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "color" text DEFAULT '#6b7280',
  "sort_order" integer DEFAULT 0,
  "is_default" boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS "board_columns_workflow_id_idx" ON "board_columns" ("workflow_id");

CREATE TABLE IF NOT EXISTS "workflow_tags" (
  "id" bigint PRIMARY KEY NOT NULL,
  "workflow_id" bigint REFERENCES "workflows"("id") ON DELETE cascade,
  "tag" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "workflow_tags_workflow_id_idx" ON "workflow_tags" ("workflow_id");

CREATE TABLE IF NOT EXISTS "task_time_logs" (
  "id" bigint PRIMARY KEY NOT NULL,
  "workflow_id" bigint REFERENCES "workflows"("id") ON DELETE cascade,
  "task_id" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "duration_seconds" integer
);
CREATE INDEX IF NOT EXISTS "task_time_logs_workflow_id_idx" ON "task_time_logs" ("workflow_id");
CREATE INDEX IF NOT EXISTS "task_time_logs_task_id_idx" ON "task_time_logs" ("task_id");

CREATE TABLE IF NOT EXISTS "workflow_shares" (
  "id" bigint PRIMARY KEY NOT NULL,
  "workflow_id" bigint REFERENCES "workflows"("id") ON DELETE cascade,
  "user_id" text NOT NULL,
  "permission" text DEFAULT 'viewer' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "workflow_shares_workflow_id_idx" ON "workflow_shares" ("workflow_id");

CREATE TABLE IF NOT EXISTS "recurring_tasks" (
  "id" bigint PRIMARY KEY NOT NULL,
  "workflow_id" bigint REFERENCES "workflows"("id") ON DELETE cascade,
  "stage_id" bigint REFERENCES "workflow_stages"("id") ON DELETE cascade,
  "interval" text NOT NULL,
  "next_run_at" timestamp with time zone NOT NULL,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "recurring_tasks_workflow_id_idx" ON "recurring_tasks" ("workflow_id");
`;

@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: () => {
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
        });
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnModuleInit {
  private readonly logger = new Logger(DatabaseModule.name);

  async onModuleInit() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      this.logger.warn('DATABASE_URL not set — skipping migrations');
      return;
    }

    const pool = new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 10000,
    });

    try {
      this.logger.log('Running migrations...');
      await pool.query(MIGRATION_SQL);
      this.logger.log('✅ Tables created / verified');
    } catch (error) {
      this.logger.error(
        `Migration failed: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      await pool.end();
    }
  }
}
