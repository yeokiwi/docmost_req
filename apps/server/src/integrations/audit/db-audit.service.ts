import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { ClsService } from 'nestjs-cls';
import { Cron, CronExpression } from '@nestjs/schedule';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { ActorType, AuditLogPayload } from '../../common/events/audit-events';
import {
  AUDIT_CONTEXT_KEY,
  AuditContext,
} from '../../common/middlewares/audit-context.middleware';
import { AuditLogContext, IAuditService } from './audit.service';

export const DEFAULT_AUDIT_RETENTION_DAYS = 365;

/**
 * Writes audit events to the `audit` table. The actor, workspace, IP and
 * user agent come from the request context set by AuditContextMiddleware
 * and AuditActorInterceptor. Writes never block or fail the request.
 */
@Injectable()
export class DbAuditService implements IAuditService {
  private readonly logger = new Logger(DbAuditService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly cls: ClsService,
  ) {}

  private context(): AuditContext | undefined {
    try {
      return this.cls.get<AuditContext>(AUDIT_CONTEXT_KEY);
    } catch {
      return undefined;
    }
  }

  log(payload: AuditLogPayload): void {
    const ctx = this.context();
    if (!ctx?.workspaceId) return;
    this.insert([payload], {
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId ?? undefined,
      actorType: ctx.actorType,
      ipAddress: ctx.ipAddress ?? undefined,
      userAgent: ctx.userAgent ?? undefined,
    });
  }

  logWithContext(payload: AuditLogPayload, context: AuditLogContext): void {
    this.insert([payload], context);
  }

  logBatchWithContext(
    payloads: AuditLogPayload[],
    context: AuditLogContext,
  ): void {
    if (payloads.length) this.insert(payloads, context);
  }

  setActorId(actorId: string): void {
    const ctx = this.context();
    if (ctx) {
      ctx.actorId = actorId;
      this.cls.set(AUDIT_CONTEXT_KEY, ctx);
    }
  }

  setActorType(actorType: ActorType): void {
    const ctx = this.context();
    if (ctx) {
      ctx.actorType = actorType;
      this.cls.set(AUDIT_CONTEXT_KEY, ctx);
    }
  }

  async updateRetention(
    workspaceId: string,
    retentionDays: number,
  ): Promise<void> {
    await this.db
      .updateTable('workspaces')
      .set({ auditRetentionDays: retentionDays })
      .where('id', '=', workspaceId)
      .execute();
  }

  private insert(payloads: AuditLogPayload[], context: AuditLogContext) {
    if (!context.workspaceId) return;
    const rows = payloads.map((p) => {
      // unauthenticated auth events (login, signup, password reset) are
      // performed by the user they are about
      const actorId =
        context.actorId ??
        (p.resourceType === 'user' && isUuid(p.resourceId)
          ? p.resourceId
          : null);
      return {
        workspaceId: context.workspaceId,
        actorId,
        actorType: context.actorType ?? (actorId ? 'user' : 'system'),
        event: p.event,
        resourceType: p.resourceType,
        resourceId: isUuid(p.resourceId) ? p.resourceId : null,
        spaceId: isUuid(p.spaceId) ? p.spaceId : null,
        changes: p.changes ?? null,
        metadata:
          p.resourceId && !isUuid(p.resourceId)
            ? { ...(p.metadata ?? {}), resourceKey: p.resourceId }
            : (p.metadata ?? null),
        ipAddress: normaliseIp(context.ipAddress),
        userAgent: context.userAgent?.slice(0, 500) ?? null,
      };
    });
    this.db
      .insertInto('audit')
      .values(rows as any)
      .execute()
      .catch((err) =>
        this.logger.warn(`Failed to write audit log: ${err.message}`),
      );
  }

  /** Daily: drop events older than each workspace's retention period. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanup(): Promise<void> {
    try {
      const res = await sql`
        DELETE FROM audit a
        USING workspaces w
        WHERE a.workspace_id = w.id
          AND a.created_at < now() - make_interval(days => COALESCE(w.audit_retention_days, ${DEFAULT_AUDIT_RETENTION_DAYS})::int)
      `.execute(this.db);
      const n = Number(res.numAffectedRows ?? 0);
      if (n) this.logger.log(`Removed ${n} expired audit events`);
    } catch (err: any) {
      this.logger.warn(`Audit cleanup failed: ${err?.message}`);
    }
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

function normaliseIp(ip?: string | null): string | null {
  if (!ip) return null;
  const trimmed = ip.replace(/^::ffff:/, '').trim();
  // inet column: only plain v4/v6 addresses
  return /^[0-9a-f.:]+$/i.test(trimmed) ? trimmed : null;
}
