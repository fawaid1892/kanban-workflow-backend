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
EXCEPTION WHEN others THEN NULL;
END $$;
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
