/**
 * Seed default roles.
 * Run: npx ts-node src/database/seed.ts
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

const DEFAULT_ROLES = [
  { slug: 'backend', name: 'Backend Developer', description: 'Handles server-side logic, APIs, and database operations', color: '#3b82f6' },
  { slug: 'frontend', name: 'Frontend Developer', description: 'Builds user interfaces and client-side interactions', color: '#8b5cf6' },
  { slug: 'qa', name: 'QA Engineer', description: 'Tests features and ensures quality standards', color: '#10b981' },
  { slug: 'cybersecurity', name: 'Cybersecurity', description: 'Reviews security, performs audits, and hardens systems', color: '#ef4444' },
  { slug: 'devops', name: 'DevOps', description: 'Manages deployment, CI/CD, and infrastructure', color: '#f59e0b' },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  console.log('Seeding default roles...');
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < DEFAULT_ROLES.length; i++) {
    const role = DEFAULT_ROLES[i];
    const existing = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.slug, role.slug))
      .limit(1);

    if (existing.length > 0) {
      console.log(`  ⏭ ${role.slug} — already exists`);
      skipped++;
      continue;
    }

    await db.insert(schema.roles).values({
      id: i + 1,
      slug: role.slug,
      name: role.name,
      description: role.description,
      color: role.color,
      sortOrder: i,
    });
    console.log(`  ✅ ${role.slug} — created`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped`);
  await pool.end();
}

main();
