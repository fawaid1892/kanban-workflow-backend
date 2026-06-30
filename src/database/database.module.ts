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
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (nodeEnv !== 'production') {
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
      });
      const db = drizzle(pool, { schema });
      logger.log('Running database migrations...');
      await migrate(db, { migrationsFolder: './drizzle' });
      logger.log('Migrations completed successfully');
    } catch (error) {
      logger.warn(
        `Could not run migrations (DB may not be available): ${error instanceof Error ? error.message : error}`,
      );
    }
  } else {
    logger.log('Skipping auto-migrate in production');
  }
}
