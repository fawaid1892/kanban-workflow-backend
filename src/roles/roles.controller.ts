import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async findAll() {
    return this.rolesService.findAll();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: CreateRoleDto,
  ) {
    return this.rolesService.create(dto);
  }

  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    return this.rolesService.findBySlug(slug);
  }

  @Put(':slug')
  async update(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(slug, dto);
  }

  @Delete(':slug')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('slug') slug: string) {
    return this.rolesService.remove(slug);
  }
}
