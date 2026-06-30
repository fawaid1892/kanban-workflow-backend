import {
  Controller,
  Get,
  Put,
  Body,
  ValidationPipe,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSharedModelDto } from './dto/update-shared-model.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('model')
  async getSharedModel() {
    return this.settingsService.getSharedModel();
  }

  @Put('model')
  async updateSharedModel(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateSharedModelDto,
  ) {
    return this.settingsService.updateSharedModel(dto);
  }
}
