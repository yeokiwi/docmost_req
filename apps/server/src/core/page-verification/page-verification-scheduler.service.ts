import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { EXPIRING_SOON_DAYS } from './page-verification.util';

const RECONCILE_SCHEDULER_ID = 'page-verification-reconcile';
const RECONCILE_INTERVAL_MS = 60 * 60 * 1000; // hourly

/**
 * Hourly sweep: marks lapsed verifications as expired and queues the
 * "expires soon" / "expired" notifications. The notification service skips
 * users who were already notified for the current period.
 */
@Injectable()
export class PageVerificationSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PageVerificationSchedulerService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.notificationQueue.upsertJobScheduler(
        RECONCILE_SCHEDULER_ID,
        { every: RECONCILE_INTERVAL_MS },
        { name: QueueJob.VERIFICATION_RECONCILE, data: {} },
      );
    } catch (err: any) {
      this.logger.warn(`Could not schedule verification sweep: ${err?.message}`);
    }
  }

  async reconcile(now: Date = new Date()): Promise<void> {
    const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86_400_000);

    const expiring = await this.db
      .selectFrom('pageVerifications')
      .select('id')
      .where('type', '=', 'expiring')
      .where('status', '=', 'verified')
      .where('expiresAt', '>', now)
      .where('expiresAt', '<=', soon)
      .execute();

    const expired = await this.db
      .updateTable('pageVerifications')
      .set({ status: 'expired', updatedAt: now })
      .where('type', '=', 'expiring')
      .where('status', '=', 'verified')
      .where('expiresAt', '<=', now)
      .returning('id')
      .execute();

    for (const { id } of expiring) {
      await this.notificationQueue.add(QueueJob.PAGE_VERIFICATION_EXPIRING, {
        verificationId: id,
      });
    }
    for (const { id } of expired) {
      await this.notificationQueue.add(QueueJob.PAGE_VERIFICATION_EXPIRED, {
        verificationId: id,
      });
    }

    if (expiring.length || expired.length) {
      this.logger.debug(
        `Verification sweep: ${expiring.length} expiring, ${expired.length} expired`,
      );
    }
  }
}
