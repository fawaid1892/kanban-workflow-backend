import { execSync } from 'child_process';

export function hermesProfileCreate(slug: string): boolean {
  try {
    execSync(`hermes profile create ${slug} --clone`, { stdio: 'pipe' });
    return true;
  } catch (e) {
    console.warn(
      `Failed to create Hermes profile '${slug}':`,
      (e as Error).message,
    );
    return false;
  }
}

export function hermesProfileDescribe(
  slug: string,
  description: string,
): boolean {
  try {
    execSync(
      `hermes profile describe ${slug} --text "${description.replace(/"/g, '\\"')}"`,
      { stdio: 'pipe' },
    );
    return true;
  } catch (e) {
    console.warn(
      `Failed to describe Hermes profile '${slug}':`,
      (e as Error).message,
    );
    return false;
  }
}

export function hermesProfileDelete(slug: string): boolean {
  try {
    execSync(`hermes profile delete ${slug}`, { stdio: 'pipe' });
    return true;
  } catch (e) {
    console.warn(
      `Failed to delete Hermes profile '${slug}':`,
      (e as Error).message,
    );
    return false;
  }
}
