import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  Min,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  slug!: string;

  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  sandboxImage?: string;

  @IsOptional()
  @IsString()
  sandboxNetwork?: string;

  @IsOptional()
  @IsString()
  sandboxMemory?: string;

  @IsOptional()
  @IsString()
  sandboxCpu?: string;

  @IsOptional()
  @IsNumber()
  sandboxTimeout?: number;

  @IsOptional()
  @IsBoolean()
  preCacheDeps?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['shared', 'dedicated'])
  modelMode?: string;

  @IsOptional()
  @IsString()
  modelProvider?: string;

  @IsOptional()
  @IsString()
  modelName?: string;

  @IsOptional()
  @IsNumber()
  modelTemperature?: number;

  @IsOptional()
  @IsNumber()
  modelMaxTokens?: number;

  @IsOptional()
  @IsString()
  modelSystemPrompt?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  modelMaxTurns?: number;
}
