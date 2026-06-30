import * as fs from 'fs';
import * as path from 'path';

const SHARED_MODEL_PATH = path.resolve(
  process.cwd(),
  'hermes-shared-model.json',
);

interface SharedModelConfig {
  provider: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
}

interface RoleModelConfig {
  modelMode: string | null;
  modelProvider: string | null;
  modelName: string | null;
  modelTemperature: number | null;
  modelMaxTokens: number | null;
  modelSystemPrompt: string | null;
  modelMaxTurns: number | null;
}

/**
 * Read the shared model settings file.
 * Returns defaults if file not found.
 */
export function readSharedModelConfig(): SharedModelConfig {
  try {
    const raw = fs.readFileSync(SHARED_MODEL_PATH, 'utf-8');
    return JSON.parse(raw) as SharedModelConfig;
  } catch {
    return {
      provider: 'deepseek',
      model: 'deepseek-v3',
      apiKey: '',
      temperature: 0.7,
      maxTokens: 4096,
    };
  }
}

/**
 * Generate environment variables for a Podman container based on a role's
 * model configuration.
 *
 * - Shared mode: inject HERMES_PROVIDER, HERMES_MODEL, HERMES_API_KEY
 *   from the shared settings file.
 * - Dedicated mode: inject a provider-specific API key based on the role's
 *   modelProvider (e.g. DEEPSEEK_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY).
 */
export function generateContainerEnv(
  slug: string,
  roleConfig: RoleModelConfig,
): Record<string, string> {
  const env: Record<string, string> = {};

  if (roleConfig.modelMode === 'shared') {
    const shared = readSharedModelConfig();
    env.HERMES_PROVIDER = shared.provider;
    env.HERMES_MODEL = shared.model;
    env.HERMES_API_KEY = shared.apiKey;
  } else {
    // Dedicated mode — inject provider-specific key
    const provider = roleConfig.modelProvider || 'deepseek';
    switch (provider) {
      case 'openai':
        env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
        break;
      case 'anthropic':
        env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
        break;
      case 'deepseek':
      default:
        env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
        break;
    }
  }

  // Always pass temperature, maxTokens, systemPrompt
  if (roleConfig.modelTemperature != null) {
    env.HERMES_TEMPERATURE = String(roleConfig.modelTemperature);
  }
  if (roleConfig.modelMaxTokens != null) {
    env.HERMES_MAX_TOKENS = String(roleConfig.modelMaxTokens);
  }
  if (roleConfig.modelSystemPrompt != null) {
    env.HERMES_SYSTEM_PROMPT = roleConfig.modelSystemPrompt;
  }

  return env;
}
