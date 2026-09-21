import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  Length,
  IsOptional,
  IsIn,
  IsUUID,
  IsNumber,
  Min,
  Max,
  IsInt,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { ISSUE_TYPES, PRIORITIES } from '../../../../../packages/shared/src/contracts.js';
import type { IssueType, Priority } from '../../../../../packages/shared/src/contracts.js';
export class IssueFieldsDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @Length(0, 200000)
  description?: string;
  @ApiProperty({ enum: PRIORITIES, required: false })
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: Priority;
  @ApiProperty({ type: String, required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  statusId?: string;
  @ApiProperty({ type: String, required: false, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;
  @ApiProperty({ type: String, required: false, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  epicId?: string | null;
  @ApiProperty({ type: String, required: false, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
  @ApiProperty({ type: String, required: false, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sprintId?: string | null;
  @ApiProperty({ type: Number, required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  estimate?: number | null;
  @ApiProperty({ type: String, isArray: true, required: false, format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  labelIds?: string[];
}
export class CreateIssueDto extends IssueFieldsDto {
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 240)
  title!: string;
  @ApiProperty({ enum: ISSUE_TYPES })
  @IsIn(ISSUE_TYPES)
  type!: IssueType;
}
export class UpdateIssueDto extends IssueFieldsDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @Length(1, 240)
  title?: string;
  @ApiProperty({ enum: ISSUE_TYPES, required: false })
  @IsOptional()
  @IsIn(ISSUE_TYPES)
  type?: IssueType;
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  version!: number;
}
export class CommentDto {
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 20000)
  content!: string;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}
