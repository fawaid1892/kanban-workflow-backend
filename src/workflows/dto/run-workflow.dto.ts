import { IsObject, IsOptional, IsArray, IsNumber } from 'class-validator';

export class RunWorkflowDto {
  @IsObject()
  params!: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  skipStages?: number[];

  @IsOptional()
  @IsObject()
  assigneeOverrides?: Record<number, string>;
}
