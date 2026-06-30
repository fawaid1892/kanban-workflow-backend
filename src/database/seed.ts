/**
 * Seed script — inserts default roles into the database.
 *
 * Usage:
 *   npx ts-node src/database/seed.ts
 *
 * Skips roles that already exist (by slug).
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

const DEFAULT_ROLES = [
  {
    slug: 'backend',
    name: 'Senior Backend Dev',
    description:
      'Implements backend API endpoints, database schema, business logic, server-side validation',
    color: '#3B82F6',
    sandboxImage: 'node:20-alpine',
  },
  {
    slug: 'frontend',
    name: 'Senior Frontend Dev',
    description:
      'Implements UI components, client-side state, styling, frontend integration with backend API',
    color: '#10B981',
    sandboxImage: 'node:20-alpine',
  },
  {
    slug: 'qa',
    name: 'Senior QA Engineer',
    description:
      'Reviews code/PRs against acceptance criteria, runs tests, approves or rejects with specific reasons; gate before merge',
    color: '#F59E0B',
    sandboxImage: 'node:20-alpine',
  },
  {
    slug: 'cybersecurity',
    name: 'Security Engineer',
    description:
      'Reviews code for security vulnerabilities, dependency risks, secrets exposure, auth/authz flaws; security gate before deploy',
    color: '#EF4444',
    sandboxImage: 'ubuntu:22.04',
  },
  {
    slug: 'devops',
    name: 'DevOps Engineer',
    description:
      'Handles CI/CD pipeline, infra provisioning, deployment, environment config, monitoring setup',
    color: '#8B5CF6',
    sandboxImage: 'ubuntu:22.04',
  },
];

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  console.log('🌱 Seeding default roles...');

  let created = 0;
  let skipped = 0;

  for (const role of DEFAULT_ROLES) {
    const existing = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.slug, role.slug))
      .limit(1);

    if (existing.length > 0) {
      console.log(`  ⏭  Skipped '${role.slug}' — already exists`);
      skipped++;
      continue;
    }

    // Get next ID and sort_order
    const allRoles = await db
      .select({ id: schema.roles.id, sortOrder: schema.roles.sortOrder })
      .from(schema.roles);
    let nextId = 1;
    let nextSort = 0;
    if (allRoles.length > 0) {
      let maxId = 0;
      let maxSort = 0;
      for (const r of allRoles) {
        if (r.id > maxId) maxId = r.id;
        if (r.sortOrder > maxSort) maxSort = r.sortOrder;
      }
      nextId = maxId + 1;
      nextSort = maxSort + 1;
    }

    await db.insert(schema.roles).values({
      id: nextId,
      slug: role.slug,
      name: role.name,
      description: role.description,
      color: role.color,
      sortOrder: nextSort,
      sandboxImage: role.sandboxImage,
      sandboxNetwork: 'none',
      sandboxMemory: '512m',
      sandboxCpu: '0.5',
      sandboxTimeout: 7200,
      preCacheDeps: true,
      modelMode: 'shared',
      modelProvider: null,
      modelName: null,
      modelTemperature: 0.7,
      modelMaxTokens: 4096,
      modelSystemPrompt: null,
      modelMaxTurns: 20,
    });

    console.log(`  ✅ Created '${role.slug}' — ${role.name}`);
    created++;
  }

  console.log(`\nDone. ${created} created, ${skipped} skipped.`);
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
