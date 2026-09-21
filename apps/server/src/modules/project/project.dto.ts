import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches, IsOptional, IsInt, Min, IsUUID, IsIn } from 'class-validator';
export class CreateProjectDto {
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 80)
  name!: string;
  @ApiProperty({ type: String })
  @Matches(/^[A-Z][A-Z0-9]{1,11}$/)
  key!: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;
}
export class UpdateProjectDto {
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  version!: number;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;
}
export class MemberDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  actorId!: string;
  @ApiProperty({ enum: ['ADMIN', 'MEMBER', 'VIEWER', 'NONE'] })
  @IsIn(['ADMIN', 'MEMBER', 'VIEWER', 'NONE'])
  role!: 'ADMIN' | 'MEMBER' | 'VIEWER' | 'NONE';
}
export class LabelDto {
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 40)
  name!: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @Matches(/^#[a-fA-F0-9]{6}$/)
  color?: string;
}
export class StatusDto {
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  version!: number;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 40)
  name!: string;
  @ApiProperty({ enum: ['TODO', 'IN_PROGRESS', 'DONE'] })
  @IsIn(['TODO', 'IN_PROGRESS', 'DONE'])
  category!: 'TODO' | 'IN_PROGRESS' | 'DONE';
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  columnId!: string;
}
