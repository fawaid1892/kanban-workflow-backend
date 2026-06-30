import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  MinLength,
} from 'class-validator';

export class UpdateStageDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  titleTemplate?: string;

  @IsString()
  @IsOptional()
  assigneeSlug?: string;

  @IsString()
  @IsOptional()
  initialStatus?: string;

  @IsString()
  @IsOptional()
  workspaceKind?: string;

  @IsNumber()
  @IsOptional()
  maxRuntime?: number;

  @IsNumber()
  @IsOptional()
  maxRetries?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skills?: string[];

  @IsBoolean()
  @IsOptional()
  goalMode?: boolean;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}
