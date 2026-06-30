import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsArray } from 'class-validator';

export class CreateStageDto {
  @IsNumber()
  sortOrder!: number;

  @IsString()
  @IsNotEmpty()
  titleTemplate!: string;

  @IsString()
  @IsNotEmpty()
  roleSlug!: string;

  @IsString()
  @IsNotEmpty()
  roleLabel!: string;

  @IsOptional()
  @IsString()
  initialStatus?: string;

  @IsOptional()
  @IsNumber()
  maxRuntime?: number;

  @IsOptional()
  @IsNumber()
  maxRetries?: number;

  @IsOptional()
  @IsArray()
  skills?: string[];

  @IsOptional()
  @IsBoolean()
  goalMode?: boolean;
}
