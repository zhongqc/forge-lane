import { IsString, Matches, IsOptional, IsBoolean, IsArray, ArrayMaxSize, MaxLength } from 'class-validator';
import type { GitHubRule } from '../../../../../packages/shared/src/github.js';
export class ConnectGitHubDto {
  @IsString() @Matches(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/) @MaxLength(200) fullName!: string;
  @IsString() @Matches(/^[1-9][0-9]{0,19}$/) installationId!: string;
}
export class UpdateGitHubDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(3) rules?: GitHubRule[];
}
