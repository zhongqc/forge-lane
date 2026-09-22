import { TokenController } from './token.controller.js';
import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionGuard } from './auth.guard.js';
import { AccessService } from './access.service.js';
@Global()
@Module({
  controllers: [AuthController, TokenController],
  providers: [AuthService, SessionGuard, AccessService],
  exports: [AuthService, SessionGuard, AccessService],
})
export class AuthModule {}
