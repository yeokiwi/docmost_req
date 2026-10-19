import { Global, Module } from '@nestjs/common';
import { AUDIT_SERVICE } from './audit.service';
import { DbAuditService } from './db-audit.service';

@Global()
@Module({
  providers: [
    {
      provide: AUDIT_SERVICE,
      useClass: DbAuditService,
    },
  ],
  exports: [AUDIT_SERVICE],
})
export class AuditModule {}
