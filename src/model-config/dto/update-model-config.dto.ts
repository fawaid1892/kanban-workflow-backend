import {
  IsOptional,
  IsString,
  IsNumber,
  IsIn,
  Min,
} from 'class-validator';

export class UpdateModelConfigDto {
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
