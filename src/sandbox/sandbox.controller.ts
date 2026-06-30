import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { UpdateSandboxDto } from './dto/update-sandbox.dto';

@Controller()
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  // ── S3-01: Podman health check ──
  @Get('sandbox/health')
  checkHealth() {
    return this.sandboxService.checkHealth();
  }

  // ── S3-02: Build image per role ──
  @Post('roles/:slug/sandbox/build')
  @HttpCode(HttpStatus.ACCEPTED)
  async buildImage(@Param('slug') slug: string) {
    return this.sandboxService.buildImage(slug);
  }

  // ── S3-04: Read sandbox config ──
  @Get('roles/:slug/sandbox')
  async readSandboxConfig(@Param('slug') slug: string) {
    return this.sandboxService.readSandboxConfig(slug);
  }

  // ── S3-05: Update sandbox config ──
  @Put('roles/:slug/sandbox')
  async updateSandboxConfig(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateSandboxDto,
  ) {
    return this.sandboxService.updateSandboxConfig(slug, dto);
  }

  // ── S3-06: Get latest build log ──
  @Get('roles/:slug/sandbox/logs')
  async getLatestBuildLog(@Param('slug') slug: string) {
    return this.sandboxService.getLatestBuildLog(slug);
  }

  // ── S3-06: Get specific build log ──
  @Get('roles/:slug/sandbox/logs/:buildId')
  async getBuildLogById(
    @Param('slug') slug: string,
    @Param('buildId') buildId: string,
  ) {
    return this.sandboxService.getBuildLogById(slug, Number(buildId));
  }

  // ── S3-07: Prune cleanup ──
  @Post('sandbox/prune')
  @HttpCode(HttpStatus.OK)
  async prune() {
    return this.sandboxService.prune();
  }
}
