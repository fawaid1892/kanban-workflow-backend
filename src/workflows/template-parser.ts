/**
 * Template Parser — replaces {param_name} placeholders in stage title templates.
 *
 * Usage:
 *   parseTemplate('Fix {feature_name} bug', { feature_name: 'Cart' })
 *   → 'Fix Cart bug'
 *
 * Auto-fills: {date} → current ISO date, {timestamp} → unix ms
 */

const AUTO_PARAMS: Record<string, () => string> = {
  date: () => new Date().toISOString().split('T')[0],
  timestamp: () => String(Date.now()),
  datetime: () => new Date().toISOString(),
};

export function parseTemplate(
  template: string,
  params: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    // User-supplied param takes priority
    if (params[key] !== undefined) {
      return sanitizeParam(params[key]);
    }
    // Auto-fill built-in params
    if (AUTO_PARAMS[key]) {
      return AUTO_PARAMS[key]();
    }
    // Missing param — keep placeholder
    return match;
  });
}

/**
 * Sanitize param value for safe use in CLI context.
 * Strips shell metacharacters, limits length.
 */
export function sanitizeParam(value: string): string {
  return value
    .replace(/[;&|`$(){}!<>\\'"*?~#]/g, '') // strip shell metacharacters
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
    .slice(0, 500); // max 500 chars
}

/**
 * Extract {param_name} placeholders from a template string.
 */
export function extractParams(template: string): string[] {
  const matches = template.match(/\{(\w+)\}/g);
  if (!matches) return [];
  // dedupe
  const unique = new Set(matches.map((m) => m.slice(1, -1)));
  // remove auto-filled ones
  for (const auto of Object.keys(AUTO_PARAMS)) {
    unique.delete(auto);
  }
  return Array.from(unique).sort();
}
