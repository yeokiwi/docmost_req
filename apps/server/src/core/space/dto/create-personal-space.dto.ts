import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePersonalSpaceDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
