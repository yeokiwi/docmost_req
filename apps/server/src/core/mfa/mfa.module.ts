import { Module } from '@nestjs/common';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import { TokenModule } from '../auth/token.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TokenModule, AuthModule],
  controllers: [MfaController],
  providers: [MfaService],
  exports: [MfaService],
})
export class MfaModule {}
