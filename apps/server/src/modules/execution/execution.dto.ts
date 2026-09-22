import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
export class ClaimDto {
  @IsInt() @Min(1) version!: number;
  @IsInt() @Min(5) @Max(120) leaseMinutes = 30;
  @IsString() @Length(1, 100) executor = 'codex';
}
export class RenewDto {
  @IsInt() @Min(1) version!: number;
  @IsInt() @Min(5) @Max(120) leaseMinutes = 30;
}
export class FinishDto {
  @IsInt() @Min(1) version!: number;
  @IsIn(['SUCCEEDED', 'FAILED', 'CANCELLED']) outcome!: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  @IsString() @MaxLength(20000) summary!: string;
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/)
  prUrl?: string;
}
