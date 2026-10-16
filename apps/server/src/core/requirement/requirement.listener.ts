import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventName } from '../../common/events/event.contants';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { IRequirementIndexJob } from '../../integrations/queue/constants/queue.interface';
import { PageEvent } from '../../database/listeners/page.listener';

// Page events can fire inside an uncommitted transaction; give it time to
// commit before the index job reads the page.
const INDEX_DELAY_MS = 3000;

@Injectable()
export class RequirementListener {
  constructor(
    @InjectQueue(QueueName.REQUIREMENT_QUEUE)
    private readonly requirementQueue: Queue,
  ) {}

  @OnEvent(EventName.PAGE_CREATED)
  async handlePageCreated(event: PageEvent) {
    await this.enqueue(event);
  }

  @OnEvent(EventName.PAGE_SOFT_DELETED)
  async handlePageSoftDeleted(event: PageEvent) {
    await this.enqueue(event);
  }

  @OnEvent(EventName.PAGE_RESTORED)
  async handlePageRestored(event: PageEvent) {
    await this.enqueue(event);
  }

  private async enqueue(event: PageEvent) {
    if (!event?.pageIds?.length) return;
    await this.requirementQueue.add(
      QueueJob.REQUIREMENT_INDEX,
      { pageIds: event.pageIds } as IRequirementIndexJob,
      { delay: INDEX_DELAY_MS },
    );
  }
}
