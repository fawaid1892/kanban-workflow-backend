import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface SharedModelSettings {
  provider: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
}

const DEFAULT_SETTINGS: SharedModelSettings = {
  provider: 'deepseek',
  model: 'deepseek-v3',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 4096,
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly settingsPath = path.resolve(
    process.cwd(),
    'hermes-shared-model.json',
  );

  /**
   * Read shared model settings from the JSON file.
   * Returns defaults if file does not exist.
   */
  getSharedModel(): SharedModelSettings {
    try {
      if (!fs.existsSync(this.settingsPath)) {
        this.logger.warn(
          `Shared model settings file not found at ${this.settingsPath}, using defaults`,
        );
        return { ...DEFAULT_SETTINGS };
      }
      const raw = fs.readFileSync(this.settingsPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<SharedModelSettings>;
      return {
        provider: parsed.provider ?? DEFAULT_SETTINGS.provider,
        model: parsed.model ?? DEFAULT_SETTINGS.model,
        apiKey: parsed.apiKey ?? DEFAULT_SETTINGS.apiKey,
        temperature: parsed.temperature ?? DEFAULT_SETTINGS.temperature,
        maxTokens: parsed.maxTokens ?? DEFAULT_SETTINGS.maxTokens,
      };
    } catch (err) {
      this.logger.warn(
        `Failed to read shared model settings: ${err instanceof Error ? err.message : err}`,
      );
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Write shared model settings to the JSON file.
   */
  updateSharedModel(settings: Partial<SharedModelSettings>): SharedModelSettings {
    const current = this.getSharedModel();
    const updated: SharedModelSettings = {
      provider: settings.provider ?? current.provider,
      model: settings.model ?? current.model,
      apiKey: settings.apiKey ?? current.apiKey,
      temperature: settings.temperature ?? current.temperature,
      maxTokens: settings.maxTokens ?? current.maxTokens,
    };

    try {
      fs.writeFileSync(
        this.settingsPath,
        JSON.stringify(updated, null, 2) + '\n',
        'utf-8',
      );
      this.logger.log(`Shared model settings saved to ${this.settingsPath}`);
    } catch (err) {
      this.logger.warn(
        `Failed to write shared model settings: ${err instanceof Error ? err.message : err}`,
      );
    }

    return updated;
  }
}
