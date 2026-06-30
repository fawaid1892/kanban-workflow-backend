CREATE TABLE "roles" (
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
--> statement-breakpoint
CREATE TABLE "sandbox_builds" (
	"id" bigint PRIMARY KEY NOT NULL,
	"role_slug" text NOT NULL,
	"image_tag" text NOT NULL,
	"status" text DEFAULT 'building' NOT NULL,
	"log_output" text,
	"error_message" text,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_dependencies" (
	"id" bigint PRIMARY KEY NOT NULL,
	"stage_id" bigint NOT NULL,
	"parent_id" bigint NOT NULL,
	CONSTRAINT "stage_parent_uniq" UNIQUE("stage_id","parent_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" bigint PRIMARY KEY NOT NULL,
	"workflow_id" bigint,
	"params" jsonb,
	"task_ids" text[],
	"status" text DEFAULT 'running' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflow_stages" (
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
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sandbox_builds" ADD CONSTRAINT "sandbox_builds_role_slug_roles_slug_fk" FOREIGN KEY ("role_slug") REFERENCES "public"."roles"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_dependencies" ADD CONSTRAINT "stage_dependencies_stage_id_workflow_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."workflow_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_dependencies" ADD CONSTRAINT "stage_dependencies_parent_id_workflow_stages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."workflow_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_assignee_slug_roles_slug_fk" FOREIGN KEY ("assignee_slug") REFERENCES "public"."roles"("slug") ON DELETE no action ON UPDATE no action;