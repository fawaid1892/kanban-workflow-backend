import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, asc } from 'drizzle-orm';
import * as schema from '../database/schema';
import { DRIZZLE } from '../database/database.module';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import {
  hermesProfileCreate,
  hermesProfileDescribe,
  hermesProfileDelete,
} from '../common/hermes';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findAll() {
    return this.db
      .select()
      .from(schema.roles)
      .orderBy(asc(schema.roles.sortOrder));
  }

  async findBySlug(slug: string) {
    const [role] = await this.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.slug, slug))
      .limit(1);

    if (!role) {
      throw new NotFoundException(`Role with slug '${slug}' not found`);
    }

    return role;
  }

  async create(dto: CreateRoleDto) {
    // Check if slug already exists
    const existing = await this.db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.slug, dto.slug))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException(
        `Role with slug '${dto.slug}' already exists`,
      );
    }

    // Get the next sort order if not provided
    const sortOrder = await this.resolveSortOrder(dto.sortOrder);

    // Get the next ID
    const nextId = await this.resolveNextId();

    const [role] = await this.db
      .insert(schema.roles)
      .values({
        id: nextId,
        slug: dto.slug,
        name: dto.name,
        description: dto.description,
        color: dto.color ?? '#6366f1',
        sortOrder,
        sandboxImage: dto.sandboxImage ?? 'node:20-alpine',
        sandboxNetwork: dto.sandboxNetwork ?? 'none',
        sandboxMemory: dto.sandboxMemory ?? '512m',
        sandboxCpu: dto.sandboxCpu ?? '0.5',
        sandboxTimeout: dto.sandboxTimeout ?? 7200,
        preCacheDeps: dto.preCacheDeps ?? true,
        modelMode: dto.modelMode ?? 'shared',
        modelProvider: dto.modelProvider ?? null,
        modelName: dto.modelName ?? null,
        modelTemperature: dto.modelTemperature ?? 0.7,
        modelMaxTokens: dto.modelMaxTokens ?? 4096,
        modelSystemPrompt: dto.modelSystemPrompt ?? null,
        modelMaxTurns: dto.modelMaxTurns ?? 20,
      })
      .returning();

    // Sync to Hermes profile (non-blocking — just log warning on failure)
    this.syncToHermesOnCreate(role);

    return role;
  }

  async update(slug: string, dto: UpdateRoleDto) {
    // Check role exists
    await this.findBySlug(slug);

    const updateData: Record<string, unknown> = {};
    const fields: (keyof UpdateRoleDto)[] = [
      'name',
      'description',
      'color',
      'sortOrder',
      'sandboxImage',
      'sandboxNetwork',
      'sandboxMemory',
      'sandboxCpu',
      'sandboxTimeout',
      'preCacheDeps',
      'modelMode',
      'modelProvider',
      'modelName',
      'modelTemperature',
      'modelMaxTokens',
      'modelSystemPrompt',
      'modelMaxTurns',
    ];

    for (const field of fields) {
      if (dto[field] !== undefined) {
        updateData[field] = dto[field];
      }
    }

    if (Object.keys(updateData).length > 0) {
      const setValues: Record<string, unknown> = { updatedAt: new Date() };
      for (const [key, value] of Object.entries(updateData)) {
        setValues[key] = value;
      }
      await this.db
        .update(schema.roles)
        .set(setValues)
        .where(eq(schema.roles.slug, slug));
    }

    const [updatedRole] = await this.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.slug, slug))
      .limit(1);

    return updatedRole;
  }

  async remove(slug: string) {
    await this.findBySlug(slug);

    await this.db.delete(schema.roles).where(eq(schema.roles.slug, slug));

    // Sync to Hermes — delete profile
    this.logger.log(
      `Deleted role '${slug}', syncing Hermes profile deletion...`,
    );
    hermesProfileDelete(slug);

    return { deleted: true, slug };
  }

  /**
   * Sync a newly created role to Hermes profile.
   * Logs warning on failure but does not crash the request.
   */
  private syncToHermesOnCreate(role: typeof schema.roles.$inferSelect) {
    this.logger.log(`Syncing role '${role.slug}' to Hermes profile...`);

    const created = hermesProfileCreate(role.slug);
    if (created) {
      hermesProfileDescribe(role.slug, role.description);
    }
  }

  private async resolveSortOrder(hint?: number): Promise<number> {
    if (hint !== undefined) return hint;

    const allRoles = await this.db
      .select({ sortOrder: schema.roles.sortOrder })
      .from(schema.roles)
      .orderBy(asc(schema.roles.sortOrder));

    if (allRoles.length === 0) return 0;

    let max = 0;
    for (const r of allRoles) {
      if (r.sortOrder > max) max = r.sortOrder;
    }
    return max + 1;
  }

  private async resolveNextId(): Promise<number> {
    const allIds = await this.db
      .select({ id: schema.roles.id })
      .from(schema.roles);

    if (allIds.length === 0) return 1;

    let maxId = 0;
    for (const r of allIds) {
      if (r.id > maxId) maxId = r.id;
    }
    return maxId + 1;
  }
}
