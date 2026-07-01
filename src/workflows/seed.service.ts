import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../database/schema';
import { DRIZZLE } from '../database/database.module';
import { Inject } from '@nestjs/common';
import { createBoard } from './kanban-client';

const SEED_WORKFLOWS = [
  {
    name: 'Feature Development',
    description: 'Full feature cycle: spec → backend → frontend → QA → deploy',
    stages: [
      { titleTemplate: 'Spec: {featureName}', roleLabel: 'Spec', roleSlug: 'spec', initialStatus: 'triage', sortOrder: 0, skills: ['planning', 'requirements'] },
      { titleTemplate: 'Implement backend {featureName}', roleLabel: 'Backend', roleSlug: 'backend', initialStatus: 'todo', sortOrder: 1, skills: ['go', 'node', 'postgres'] },
      { titleTemplate: 'Implement frontend {featureName}', roleLabel: 'Frontend', roleSlug: 'frontend', initialStatus: 'todo', sortOrder: 2, skills: ['react', 'typescript', 'tailwind'] },
      { titleTemplate: 'QA review {featureName}', roleLabel: 'QA', roleSlug: 'qa', initialStatus: 'todo', sortOrder: 3, skills: ['playwright', 'testing'] },
      { titleTemplate: 'Deploy {featureName}', roleLabel: 'DevOps', roleSlug: 'devops', initialStatus: 'todo', sortOrder: 4, skills: ['docker', 'ci-cd'] },
    ],
    dependencies: [
      { parentIndex: 0, childIndex: 1 },
      { parentIndex: 0, childIndex: 2 },
      { parentIndex: 1, childIndex: 3 },
      { parentIndex: 2, childIndex: 3 },
      { parentIndex: 3, childIndex: 4 },
    ],
    tags: ['feature', 'full-cycle'],
  },
  {
    name: 'Bug Fix',
    description: 'Quick bug fix: reproduce → fix → verify',
    stages: [
      { titleTemplate: 'Reproduce bug: {bugTitle}', roleLabel: 'QA', roleSlug: 'qa', initialStatus: 'todo', sortOrder: 0, skills: ['testing', 'debugging'] },
      { titleTemplate: 'Fix: {bugTitle}', roleLabel: 'Backend', roleSlug: 'backend', initialStatus: 'todo', sortOrder: 1, skills: ['go', 'node'] },
      { titleTemplate: 'Verify fix: {bugTitle}', roleLabel: 'QA', roleSlug: 'qa', initialStatus: 'todo', sortOrder: 2, skills: ['playwright', 'testing'] },
    ],
    dependencies: [
      { parentIndex: 0, childIndex: 1 },
      { parentIndex: 1, childIndex: 2 },
    ],
    tags: ['bugfix', 'hotfix'],
  },
  {
    name: 'Code Review',
    description: 'Review and merge: review → test → merge',
    stages: [
      { titleTemplate: 'Review PR #{prNumber}', roleLabel: 'QA', roleSlug: 'qa', initialStatus: 'todo', sortOrder: 0, skills: ['code-review'] },
      { titleTemplate: 'Test PR #{prNumber}', roleLabel: 'QA', roleSlug: 'qa', initialStatus: 'todo', sortOrder: 1, skills: ['playwright', 'testing'] },
      { titleTemplate: 'Merge PR #{prNumber}', roleLabel: 'DevOps', roleSlug: 'devops', initialStatus: 'todo', sortOrder: 2, skills: ['git', 'ci-cd'] },
    ],
    dependencies: [
      { parentIndex: 0, childIndex: 1 },
      { parentIndex: 1, childIndex: 2 },
    ],
    tags: ['review', 'merge'],
  },
  {
    name: 'API Integration',
    description: 'Integrate external API: research → implement → test → document',
    stages: [
      { titleTemplate: 'Research API: {apiName}', roleLabel: 'Spec', roleSlug: 'spec', initialStatus: 'todo', sortOrder: 0, skills: ['research', 'api'] },
      { titleTemplate: 'Implement {apiName} integration', roleLabel: 'Backend', roleSlug: 'backend', initialStatus: 'todo', sortOrder: 1, skills: ['go', 'http'] },
      { titleTemplate: 'Test {apiName} integration', roleLabel: 'QA', roleSlug: 'qa', initialStatus: 'todo', sortOrder: 2, skills: ['testing'] },
      { titleTemplate: 'Document {apiName} usage', roleLabel: 'DevOps', roleSlug: 'devops', initialStatus: 'todo', sortOrder: 3, skills: ['documentation'] },
    ],
    dependencies: [
      { parentIndex: 0, childIndex: 1 },
      { parentIndex: 1, childIndex: 2 },
      { parentIndex: 2, childIndex: 3 },
    ],
    tags: ['api', 'integration'],
  },
];

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async onModuleInit() {
    if (process.env.SEED_DISABLED === 'true') {
      this.logger.log('Seeding disabled via SEED_DISABLED env');
      return;
    }

    const existing = await this.db.select().from(schema.workflows).limit(1);
    if (existing.length > 0) {
      this.logger.log('Database already has data — skipping seed');
      return;
    }

    this.logger.log('Seeding demo data...');
    await this.seed();
    this.logger.log('✅ Demo data seeded successfully');
  }

  private async seed() {
    for (const wf of SEED_WORKFLOWS) {
      const workflowId = await this.resolveNextId('workflows');
      await this.db.insert(schema.workflows).values({
        id: workflowId,
        name: wf.name,
        description: wf.description,
      });

      await createBoard(`wf-${workflowId}`, wf.name);

      const stageIds: number[] = [];
      for (const stage of wf.stages) {
        const stageId = await this.resolveNextId('workflow_stages');
        stageIds.push(stageId);
        await this.db.insert(schema.workflowStages).values({
          id: stageId,
          workflowId,
          titleTemplate: stage.titleTemplate,
          roleSlug: stage.roleSlug,
          roleLabel: stage.roleLabel,
          initialStatus: stage.initialStatus,
          sortOrder: stage.sortOrder,
          skills: stage.skills,
        });
      }

      for (const dep of wf.dependencies) {
        const depId = await this.resolveNextId('stage_dependencies');
        await this.db.insert(schema.stageDependencies).values({
          id: depId,
          stageId: stageIds[dep.childIndex],
          parentId: stageIds[dep.parentIndex],
        });
      }

      // Add tags
      for (const tag of wf.tags) {
        const tagId = await this.resolveNextId('workflow_tags');
        await this.db.insert(schema.workflowTags).values({
          id: tagId,
          workflowId,
          tag,
        });
      }

      // Add default columns
      const defaultColumns = [
        { key: 'todo', label: 'To Do', color: '#6b7280', sortOrder: 0 },
        { key: 'triage', label: 'Triage', color: '#eab308', sortOrder: 1 },
        { key: 'running', label: 'Running', color: '#3b82f6', sortOrder: 2 },
        { key: 'blocked', label: 'Blocked', color: '#ef4444', sortOrder: 3 },
        { key: 'done', label: 'Done', color: '#22c55e', sortOrder: 4 },
        { key: 'failed', label: 'Failed', color: '#dc2626', sortOrder: 5 },
      ];

      for (const col of defaultColumns) {
        const colId = await this.resolveNextId('board_columns');
        await this.db.insert(schema.boardColumns).values({
          id: colId,
          workflowId,
          key: col.key,
          label: col.label,
          color: col.color,
          sortOrder: col.sortOrder,
          isDefault: true,
        });
      }

      this.logger.log(`  ✓ Seeded workflow: ${wf.name} (${wf.stages.length} stages)`);
    }
  }

  private async resolveNextId(table: string): Promise<number> {
    let all: { id: number }[] = [];
    switch (table) {
      case 'workflows':
        all = await this.db.select({ id: schema.workflows.id }).from(schema.workflows);
        break;
      case 'workflow_stages':
        all = await this.db.select({ id: schema.workflowStages.id }).from(schema.workflowStages);
        break;
      case 'stage_dependencies':
        all = await this.db.select({ id: schema.stageDependencies.id }).from(schema.stageDependencies);
        break;
      case 'workflow_tags':
        all = await this.db.select({ id: schema.workflowTags.id }).from(schema.workflowTags);
        break;
      case 'board_columns':
        all = await this.db.select({ id: schema.boardColumns.id }).from(schema.boardColumns);
        break;
    }
    if (all.length === 0) return 1;
    let maxId = 0;
    for (const r of all) { if (r.id > maxId) maxId = r.id; }
    return maxId + 1;
  }
}
