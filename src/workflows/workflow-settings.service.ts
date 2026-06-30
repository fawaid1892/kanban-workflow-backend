import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../database/schema';
import { DRIZZLE } from '../database/database.module';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-me-in-production!!';
const ALGORITHM = 'aes-256-gcm';

function encrypt(text: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32), 'utf8');
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decrypt(encryptedText: string): string {
  const [ivHex, tagHex, encrypted] = encryptedText.split(':');
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32), 'utf8');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface WorkflowSettingsData {
  baseUrl: string;
  apiKey: string;
  chatSchema: string;
}

@Injectable()
export class WorkflowSettingsService {
  private readonly logger = new Logger(WorkflowSettingsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getSettings(workflowId: number) {
    const [settings] = await this.db
      .select()
      .from(schema.workflowSettings)
      .where(eq(schema.workflowSettings.workflowId, workflowId))
      .limit(1);

    if (!settings) return null;

    // Return with masked API key
    return {
      id: settings.id,
      workflowId: settings.workflowId,
      baseUrl: settings.baseUrl,
      apiKeyMasked: '***' + settings.apiKeyEncrypted.slice(-8),
      chatSchema: settings.chatSchema,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }

  async updateSettings(workflowId: number, data: WorkflowSettingsData) {
    const [existing] = await this.db
      .select()
      .from(schema.workflowSettings)
      .where(eq(schema.workflowSettings.workflowId, workflowId))
      .limit(1);

    const encryptedKey = encrypt(data.apiKey);

    if (existing) {
      await this.db
        .update(schema.workflowSettings)
        .set({
          baseUrl: data.baseUrl,
          apiKeyEncrypted: encryptedKey,
          chatSchema: data.chatSchema,
          updatedAt: new Date(),
        })
        .where(eq(schema.workflowSettings.workflowId, workflowId));
    } else {
      const nextId = await this.resolveNextId();
      await this.db.insert(schema.workflowSettings).values({
        id: nextId,
        workflowId,
        baseUrl: data.baseUrl,
        apiKeyEncrypted: encryptedKey,
        chatSchema: data.chatSchema,
      });
    }

    return this.getSettings(workflowId);
  }

  // Used by run engine to get decrypted API key
  async getDecryptedApiKey(workflowId: number): Promise<string | null> {
    const [settings] = await this.db
      .select()
      .from(schema.workflowSettings)
      .where(eq(schema.workflowSettings.workflowId, workflowId))
      .limit(1);

    if (!settings) return null;

    try {
      return decrypt(settings.apiKeyEncrypted);
    } catch {
      return settings.apiKeyEncrypted; // fallback if not encrypted yet
    }
  }

  private async resolveNextId(): Promise<number> {
    const all = await this.db
      .select({ id: schema.workflowSettings.id })
      .from(schema.workflowSettings);
    if (all.length === 0) return 1;
    let maxId = 0;
    for (const r of all) {
      if (r.id > maxId) maxId = r.id;
    }
    return maxId + 1;
  }
}
