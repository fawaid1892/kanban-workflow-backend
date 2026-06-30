import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import * as schema from '../database/schema';
import { DRIZZLE } from '../database/database.module';
import { UpdateModelConfigDto } from './dto/update-model-config.dto';
import { generateContainerEnv } from './container-env';

@Injectable()
export class ModelConfigService {
  private readonly logger = new Logger(ModelConfigService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Read model config for a role from the roles table.
   */
  async getModelConfig(slug: string) {
    const role = await this.findRole(slug);
    return {
      modelMode: role.modelMode,
      modelProvider: role.modelProvider,
      modelName: role.modelName,
      modelTemperature: role.modelTemperature,
      modelMaxTokens: role.modelMaxTokens,
      modelSystemPrompt: role.modelSystemPrompt,
      modelMaxTurns: role.modelMaxTurns,
    };
  }

  /**
   * Update model config for a role and auto-generate Hermes config.yaml.
   */
  async updateModelConfig(slug: string, dto: UpdateModelConfigDto) {
    // Ensure role exists
    await this.findRole(slug);

    const updateData: Record<string, unknown> = {};
    const fields: (keyof UpdateModelConfigDto)[] = [
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

    // Validate modelMode if provided
    if (
      dto.modelMode !== undefined &&
      !['shared', 'dedicated'].includes(dto.modelMode)
    ) {
      throw new BadRequestException(
        "modelMode must be 'shared' or 'dedicated'",
      );
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

    // Read updated role
    const updatedRole = await this.findRole(slug);

    // Auto-generate Hermes config.yaml
    this.generateHermesConfig(slug, {
      modelMode: updatedRole.modelMode,
      modelProvider: updatedRole.modelProvider,
      modelName: updatedRole.modelName,
      modelTemperature: updatedRole.modelTemperature,
      modelMaxTokens: updatedRole.modelMaxTokens,
      modelSystemPrompt: updatedRole.modelSystemPrompt,
      modelMaxTurns: updatedRole.modelMaxTurns,
    });

    return {
      modelMode: updatedRole.modelMode,
      modelProvider: updatedRole.modelProvider,
      modelName: updatedRole.modelName,
      modelTemperature: updatedRole.modelTemperature,
      modelMaxTokens: updatedRole.modelMaxTokens,
      modelSystemPrompt: updatedRole.modelSystemPrompt,
      modelMaxTurns: updatedRole.modelMaxTurns,
    };
  }

  /**
   * Generate ~/.hermes/profiles/{slug}/config.yaml for a role.
   */
  private generateHermesConfig(
    slug: string,
    config: {
      modelMode: string | null;
      modelProvider: string | null;
      modelName: string | null;
      modelTemperature: number | null;
      modelMaxTokens: number | null;
      modelSystemPrompt: string | null;
      modelMaxTurns: number | null;
    },
  ): void {
    const homeDir = process.env.HOME || '/root';
    const profileDir = path.join(homeDir, '.hermes', 'profiles', slug);

    // Ensure the profile directory exists
    fs.mkdirSync(profileDir, { recursive: true });

    let provider: string;
    let model: string;

    if (config.modelMode === 'shared') {
      // Shared mode — use env vars (will be injected at runtime)
      provider = '${HERMES_PROVIDER}';
      model = '${HERMES_MODEL}';
    } else {
      // Dedicated mode — hardcode from DB
      provider = config.modelProvider || 'deepseek';
      model = config.modelName || 'deepseek-v3';
    }

    const temperature = config.modelTemperature ?? 0.7;
    const maxTokens = config.modelMaxTokens ?? 4096;
    const systemPrompt = config.modelSystemPrompt
      ? config.modelSystemPrompt.replace(/"/g, '\\"')
      : '';
    const maxTurns = config.modelMaxTurns ?? 20;

    const yamlLines: string[] = [];

    // Provider section
    yamlLines.push('provider:');
    yamlLines.push(`  name: "${provider}"`);

    // Model section
    yamlLines.push('model:');
    yamlLines.push(`  name: "${model}"`);
    yamlLines.push(`  temperature: ${temperature}`);
    yamlLines.push(`  maxTokens: ${maxTokens}`);

    // System prompt
    if (systemPrompt) {
      yamlLines.push(`  systemPrompt: "${systemPrompt}"`);
    }

    // Max turns
    yamlLines.push(`  maxTurns: ${maxTurns}`);

    const configYaml = yamlLines.join('\n') + '\n';
    const configPath = path.join(profileDir, 'config.yaml');

    try {
      fs.writeFileSync(configPath, configYaml, 'utf-8');
      this.logger.log(`Generated Hermes config at ${configPath}`);
    } catch (err) {
      this.logger.warn(
        `Failed to write Hermes config for '${slug}': ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async findRole(slug: string) {
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
}
