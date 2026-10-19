import { Module } from '@nestjs/common';
import { SsoController } from './sso.controller';
import { OidcService } from './oidc.service';
import { SsoProviderService } from './sso-provider.service';
import { SsoLoginService } from './sso-login.service';
import { AuthModule } from '../auth/auth.module';
import { GroupModule } from '../group/group.module';

@Module({
  imports: [AuthModule, GroupModule],
  controllers: [SsoController],
  providers: [OidcService, SsoProviderService, SsoLoginService],
})
export class SsoModule {}
