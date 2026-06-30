import { IsArray, IsNumber } from 'class-validator';

export class SetDependenciesDto {
  @IsArray()
  @IsNumber({}, { each: true })
  parentIds: number[];
}
