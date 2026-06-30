import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from './schema';

export const DRIZZLE = 'DRIZZLE';

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
    await runMigrations(this.logger);
  }
}

/**
 * Run Drizzle migrations on startup.
 * In production, this is a no-op (use external migration tooling).
 * In development, auto-push schema changes.
 */
async function runMigrations(logger: Logger) {
  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    const db = drizzle(pool, { schema });
    logger.log('Running database migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    logger.log('Migrations completed successfully');

    // Auto-seed default roles if empty
    const existingRoles = await db.select().from(schema.roles).limit(1);
    if (existingRoles.length === 0) {
      logger.log('Seeding default roles...');
      const defaults = [
        { slug: 'backend', name: 'Backend Developer', description: 'Handles server-side logic, APIs, and database operations', color: '#3b82f6', sortOrder: 0 },
        { slug: 'frontend', name: 'Frontend Developer', description: 'Builds user interfaces and client-side interactions', color: '#8b5cf6', sortOrder: 1 },
        { slug: 'qa', name: 'QA Engineer', description: 'Tests features and ensures quality standards', color: '#10b981', sortOrder: 2 },
        { slug: 'cybersecurity', name: 'Cybersecurity', description: 'Reviews security, performs audits, and hardens systems', color: '#ef4444', sortOrder: 3 },
        { slug: 'devops', name: 'DevOps', description: 'Manages deployment, CI/CD, and infrastructure', color: '#f59e0b', sortOrder: 4 },
      ];
      for (let i = 0; i < defaults.length; i++) {
        const role = defaults[i];
        await db.insert(schema.roles).values({
          id: i + 1,
          slug: role.slug,
          name: role.name,
          description: role.description,
          color: role.color,
          sortOrder: role.sortOrder,
        });
      }
      logger.log(`Seeded ${defaults.length} default roles`);
    }

    await pool.end();
  } catch (error) {
    logger.warn(
      `Could not run migrations (DB may not be available): ${error instanceof Error ? error.message : error}`,
    );
  }
}
