import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, desc, asc, lt } from 'drizzle-orm';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as schema from '../database/schema';
import { DRIZZLE } from '../database/database.module';
import { UpdateSandboxDto } from './dto/update-sandbox.dto';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  /**
   * S3-01: Check Podman binary availability and version.
   */
  checkHealth(): { status: string; version: string | null } {
    try {
      const output = execSync('podman --version', {
        encoding: 'utf-8',
        timeout: 10_000,
      });
      const version = output.trim();
      return { status: 'ok', version };
    } catch {
      return { status: 'unavailable', version: null };
    }
  }

  /**
   * S3-02: Build a sandbox image for the given role.
   * Streams build progress via WebSocket.
   */
  async buildImage(slug: string): Promise<{ buildId: number; status: string }> {
    // Resolve next ID first
    const nextId = await this.resolveNextBuildId();

    // 1. Validate role exists
    const [role] = await this.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.slug, slug))
      .limit(1);

    if (!role) {
      throw new NotFoundException(`Role with slug '${slug}' not found`);
    }

    const imageTag = `kanban-${slug}:latest`;
    const baseImage = role.sandboxImage;

    // 2. Select the right Dockerfile template
    const templateContent = this.selectTemplate(baseImage);

    // 3. Generate Dockerfile content
    const dockerfileContent = templateContent
      .replace(/\${BASE_IMAGE}/g, baseImage)
      .replace(/\${EXTRA_PACKAGES}/g, '')
      .replace(/\${HERMES_BIN}/g, '/usr/local/bin/hermes');

    // 4. Write Dockerfile to temp location
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-'));
    const dockerfilePath = path.join(tmpDir, `Dockerfile.${slug}`);
    fs.writeFileSync(dockerfilePath, dockerfileContent, 'utf-8');

    let status = 'building';
    let logOutput = '';
    let errorMessage: string | null = null;

    try {
      this.logger.log(`Building image ${imageTag} for role '${slug}'...`);

      await new Promise<void>((resolve, reject) => {
        const buildIdStr = String(nextId);

        // Emit initial build progress
        this.eventsGateway.broadcastBuildProgress(
          slug,
          buildIdStr,
          `Starting build for ${imageTag}...\n`,
          'building',
        );

        const child = spawn('podman', [
          'build',
          '-t',
          imageTag,
          '-f',
          dockerfilePath,
          tmpDir,
        ]);

        let stderr = '';

        child.stdout?.on('data', (data: Buffer) => {
          const chunk = data.toString();
          logOutput += chunk;

          // Stream each chunk via WebSocket
          this.eventsGateway.broadcastBuildProgress(
            slug,
            buildIdStr,
            chunk,
            'building',
          );
        });

        child.stderr?.on('data', (data: Buffer) => {
          const chunk = data.toString();
          stderr += chunk;
          logOutput += chunk;

          // Stream each chunk via WebSocket
          this.eventsGateway.broadcastBuildProgress(
            slug,
            buildIdStr,
            chunk,
            'building',
          );
        });

        child.on('close', (code) => {
          if (code === 0) {
            status = 'success';
            this.eventsGateway.broadcastBuildProgress(
              slug,
              buildIdStr,
              `Build completed successfully for ${imageTag}\n`,
              'success',
            );
            resolve();
          } else {
            status = 'failed';
            errorMessage = stderr || `Build exited with code ${code}`;
            this.eventsGateway.broadcastBuildProgress(
              slug,
              buildIdStr,
              errorMessage,
              'failed',
            );
            reject(new Error(errorMessage));
          }
        });

        child.on('error', (err) => {
          status = 'failed';
          errorMessage = err.message;
          this.eventsGateway.broadcastBuildProgress(
            slug,
            buildIdStr,
            errorMessage,
            'failed',
          );
          reject(err);
        });
      });

      this.logger.log(`Build succeeded for role '${slug}'`);
    } catch (buildError: unknown) {
      const err = buildError as Error;
      if (!errorMessage) {
        errorMessage = err.message || 'Unknown build error';
      }
      this.logger.error(`Build failed for role '${slug}': ${errorMessage}`);
    } finally {
      // Clean up temp directory
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }

    // 5. Save build record to DB
    const [build] = await this.db
      .insert(schema.sandboxBuilds)
      .values({
        id: nextId,
        roleSlug: slug,
        imageTag: imageTag,
        status,
        logOutput: logOutput || null,
        errorMessage,
      })
      .returning();

    return { buildId: build.id, status };
  }

  /**
   * S3-04: Read sandbox config for a role.
   */
  async readSandboxConfig(slug: string) {
    const [role] = await this.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.slug, slug))
      .limit(1);

    if (!role) {
      throw new NotFoundException(`Role with slug '${slug}' not found`);
    }

    return {
      sandboxImage: role.sandboxImage,
      sandboxNetwork: role.sandboxNetwork,
      sandboxMemory: role.sandboxMemory,
      sandboxCpu: role.sandboxCpu,
      sandboxTimeout: role.sandboxTimeout,
      preCacheDeps: role.preCacheDeps,
    };
  }

  /**
   * S3-05: Update sandbox config for a role.
   */
  async updateSandboxConfig(slug: string, dto: UpdateSandboxDto) {
    const [role] = await this.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.slug, slug))
      .limit(1);

    if (!role) {
      throw new NotFoundException(`Role with slug '${slug}' not found`);
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    const fields: (keyof UpdateSandboxDto)[] = [
      'sandboxImage',
      'sandboxNetwork',
      'sandboxMemory',
      'sandboxCpu',
      'sandboxTimeout',
      'preCacheDeps',
    ];

    for (const field of fields) {
      if (dto[field] !== undefined) {
        updateData[field] = dto[field];
      }
    }

    if (Object.keys(updateData).length > 1) {
      await this.db
        .update(schema.roles)
        .set(updateData)
        .where(eq(schema.roles.slug, slug));
    }

    return this.readSandboxConfig(slug);
  }

  /**
   * S3-06: Get latest build log for a role.
   */
  async getLatestBuildLog(slug: string) {
    const [build] = await this.db
      .select()
      .from(schema.sandboxBuilds)
      .where(eq(schema.sandboxBuilds.roleSlug, slug))
      .orderBy(desc(schema.sandboxBuilds.builtAt))
      .limit(1);

    if (!build) {
      return { roleSlug: slug, buildId: null, status: null, logOutput: null, errorMessage: null, builtAt: null };
    }

    return build;
  }

  /**
   * S3-06: Get specific build log by build ID.
   */
  async getBuildLogById(slug: string, buildId: number) {
    const [build] = await this.db
      .select()
      .from(schema.sandboxBuilds)
      .where(
        eq(schema.sandboxBuilds.id, buildId) &&
        eq(schema.sandboxBuilds.roleSlug, slug),
      )
      .limit(1);

    if (!build) {
      throw new NotFoundException(
        `Build with ID '${buildId}' not found for role '${slug}'`,
      );
    }

    return build;
  }

  /**
   * S3-07: Prune old containers, images, and build logs.
   */
  async prune(): Promise<{
    containersDeleted: number;
    imagesDeleted: number;
    logsDeleted: number;
  }> {
    // Prune containers
    let containersDeleted = 0;
    try {
      const output = execSync('podman container prune -f', {
        encoding: 'utf-8',
        timeout: 30_000,
      });
      // Parse "Deleted Containers: N" or similar
      const match = output.match(/Deleted Containers:\s*(\d+)/i);
      containersDeleted = match ? parseInt(match[1], 10) : 0;
    } catch (err) {
      this.logger.warn(`Container prune failed: ${err}`);
    }

    // Prune images
    let imagesDeleted = 0;
    try {
      const output = execSync('podman image prune -f', {
        encoding: 'utf-8',
        timeout: 30_000,
      });
      const match = output.match(/Deleted Images:\s*(\d+)/i);
      imagesDeleted = match ? parseInt(match[1], 10) : 0;
    } catch (err) {
      this.logger.warn(`Image prune failed: ${err}`);
    }

    // Delete build logs older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const deletedLogs = await this.db
      .delete(schema.sandboxBuilds)
      .where(lt(schema.sandboxBuilds.builtAt, thirtyDaysAgo))
      .returning({ id: schema.sandboxBuilds.id });

    const logsDeleted = deletedLogs.length;

    return { containersDeleted, imagesDeleted, logsDeleted };
  }

  /**
   * Select the appropriate Dockerfile template based on base image prefix.
   */
  private selectTemplate(baseImage: string): string {
    const templatesDir = path.join(__dirname, 'dockerfiles');

    let templatePath: string;
    if (baseImage.startsWith('node')) {
      templatePath = path.join(templatesDir, 'node-alpine.Dockerfile.template');
    } else if (baseImage.startsWith('ubuntu')) {
      templatePath = path.join(templatesDir, 'ubuntu.Dockerfile.template');
    } else {
      // Default to node-alpine template
      templatePath = path.join(templatesDir, 'node-alpine.Dockerfile.template');
    }

    // Try alternate path for development
    if (!fs.existsSync(templatePath)) {
      const devPath = path.join(
        __dirname,
        '..',
        '..',
        'src',
        'sandbox',
        'dockerfiles',
        path.basename(templatePath),
      );
      if (fs.existsSync(devPath)) {
        templatePath = devPath;
      }
    }

    try {
      return fs.readFileSync(templatePath, 'utf-8');
    } catch {
      this.logger.warn(
        `Template not found at ${templatePath}, using inline default`,
      );
      return this.getDefaultDockerfile(baseImage);
    }
  }

  private getDefaultDockerfile(baseImage: string): string {
    if (baseImage.startsWith('node')) {
      return [
        `FROM ${baseImage}`,
        '',
        'RUN apk add --no-cache nodejs npm git curl bash',
        'WORKDIR /workspace',
        'CMD ["/bin/bash"]',
      ].join('\n');
    }
    return [
      `FROM ${baseImage}`,
      '',
      'RUN apt-get update && apt-get install -y --no-install-recommends \\',
      '    python3 python3-pip python3-venv git curl wget \\',
      '    ca-certificates build-essential \\',
      '    && rm -rf /var/lib/apt/lists/*',
      'WORKDIR /workspace',
      'CMD ["/bin/bash"]',
    ].join('\n');
  }

  private async resolveNextBuildId(): Promise<number> {
    const allBuilds = await this.db
      .select({ id: schema.sandboxBuilds.id })
      .from(schema.sandboxBuilds);

    if (allBuilds.length === 0) return 1;

    let maxId = 0;
    for (const b of allBuilds) {
      if (b.id > maxId) maxId = b.id;
    }
    return maxId + 1;
  }
}
