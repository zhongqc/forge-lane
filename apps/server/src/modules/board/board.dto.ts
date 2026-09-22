import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsInt, Min, IsOptional, Matches, IsIn } from 'class-validator';
export class MoveIssueDto {
  @ApiProperty({
    enum: ['rank', 'transition'],
    required: false,
    description:
      'rank: reorder within the current column without changing status; transition: move to a different column and append. Inferred when omitted.',
  })
  @IsOptional()
  @IsIn(['rank', 'transition'])
  intent?: 'rank' | 'transition';
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
