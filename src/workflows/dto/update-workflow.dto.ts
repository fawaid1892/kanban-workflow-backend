import { IsString, IsOptional, MinLength } from 'class-validator';

export class UpdateWorkflowDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
