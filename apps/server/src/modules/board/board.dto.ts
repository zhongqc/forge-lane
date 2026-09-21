import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsInt, Min, IsOptional, Matches } from 'class-validator';
export class MoveIssueDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  issueId!: string;
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  targetColumnId!: string;
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  targetStatusId!: string;
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
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @Matches(/^-?\d+(\.\d+)?$/)
  targetSortOrder?: string;
}
