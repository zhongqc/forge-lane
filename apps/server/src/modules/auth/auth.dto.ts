import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, IsOptional } from 'class-validator';
export class LoginDto {
  @ApiProperty({ type: String })
  @IsEmail()
  email!: string;
  @ApiProperty({ type: String })
  @IsString()
  @Length(10, 128)
  password!: string;
}
export class RegisterDto extends LoginDto {
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 60)
  name!: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  workspaceName?: string;
}
