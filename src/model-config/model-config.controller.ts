import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  ValidationPipe,
} from '@nestjs/common';
import { ModelConfigService } from './model-config.service';
import { UpdateModelConfigDto } from './dto/update-model-config.dto';

@Controller('roles')
export class ModelConfigController {
  constructor(private readonly modelConfigService: ModelConfigService) {}

  @Get(':slug/model')
  async getModelConfig(@Param('slug') slug: string) {
    return this.modelConfigService.getModelConfig(slug);
  }

  @Put(':slug/model')
  async updateModelConfig(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateModelConfigDto,
  ) {
    return this.modelConfigService.updateModelConfig(slug, dto);
  }
}
