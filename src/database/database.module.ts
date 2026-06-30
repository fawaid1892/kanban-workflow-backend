import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DRIZZLE = 'DRIZZLE';

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS "roles" (
  "id" bigint PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "color" text DEFAULT '#6366f1' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "sandbox_image" text DEFAULT 'node:20-alpine' NOT NULL,
  "sandbox_network" text DEFAULT 'none' NOT NULL,
  "sandbox_memory" text DEFAULT '512m' NOT NULL,
  "sandbox_cpu" text DEFAULT '0.5' NOT NULL,
  "sandbox_timeout" integer DEFAULT 7200 NOT NULL,
  "pre_cache_deps" boolean DEFAULT true NOT NULL,
  "model_mode" text DEFAULT 'shared' NOT NULL,
  "model_provider" text,
  "model_name" text,
  "model_temperature" real DEFAULT 0.7,
  "model_max_tokens" integer DEFAULT 4096,
  "model_system_prompt" text,
  "model_max_turns" integer DEFAULT 20,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "roles_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "sandbox_builds" (
  "id" bigint PRIMARY KEY NOT NULL,
  "role_slug" text NOT NULL,
  "image_tag" text NOT NULL,
  "status" text DEFAULT 'building' NOT NULL,
  "log_output" text,
  "error_message" text,
  "built_at" timestamp with time zone DEFAULT now() NOT NULL
);

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
  "assignee_slug" text,
  "initial_status" text DEFAULT 'todo' NOT NULL,
  "workspace_kind" text DEFAULT 'scratch' NOT NULL,
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

-- Foreign keys (using DO block for idempotency)
DO $$ BEGIN
  ALTER TABLE "sandbox_builds" ADD CONSTRAINT "sandbox_builds_role_slug_roles_slug_fk"
    FOREIGN KEY ("role_slug") REFERENCES "roles"("slug") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
    FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

const SEED_SQL = `
INSERT INTO "roles" ("id", "slug", "name", "description", "color", "sort_order")
VALUES
  (1, 'backend', 'Backend Developer', 'Handles server-side logic, APIs, and database operations', '#3b82f6', 0),
  (2, 'frontend', 'Frontend Developer', 'Builds user interfaces and client-side interactions', '#8b5cf6', 1),
  (3, 'qa', 'QA Engineer', 'Tests features and ensures quality standards', '#10b981', 2),
  (4, 'cybersecurity', 'Cybersecurity', 'Reviews security, performs audits, and hardens systems', '#ef4444', 3),
  (5, 'devops', 'DevOps', 'Manages deployment, CI/CD, and infrastructure', '#f59e0b', 4)
ON CONFLICT ("slug") DO NOTHING;
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

    const pool = new Pool({ connectionString: databaseUrl });

    try {
      this.logger.log('Running migrations...');
      await pool.query(MIGRATION_SQL);
      this.logger.log('✅ Tables created / verified');

      this.logger.log('Seeding default roles...');
      await pool.query(SEED_SQL);
      this.logger.log('✅ Roles seeded');
    } catch (error) {
      this.logger.error(
        `Migration failed: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      await pool.end();
    }
  }
}
