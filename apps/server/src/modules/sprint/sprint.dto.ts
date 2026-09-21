import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsString, Length, IsOptional, IsInt, Min, IsDateString } from 'class-validator';
export class CreateSprintDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  projectId!: string;
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 100)
  name!: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  goal?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsDateString()
  startAt?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsDateString()
  endAt?: string;
}
export class SprintCommandDto {
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  version!: number;
  @ApiProperty({ type: String, required: false, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  destinationSprintId?: string | null;
}
export class SprintIssueDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  issueId!: string;
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  version!: number;
  @ApiProperty({ type: String, required: false, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  previousIssueId?: string | null;
  @ApiProperty({ type: String, required: false, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  nextIssueId?: string | null;
}
export class PlanningMoveDto extends SprintIssueDto {
  @ApiProperty({ type: String, required: false, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetSprintId?: string | null;
}
