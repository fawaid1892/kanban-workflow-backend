import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class UpdateSandboxDto {
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
}
