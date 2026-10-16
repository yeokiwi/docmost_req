import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { IRequirementIndexJob } from '../../integrations/queue/constants/queue.interface';
import { RequirementIndexService } from './services/requirement-index.service';

@Processor(QueueName.REQUIREMENT_QUEUE)
export class RequirementProcessor extends WorkerHost {
  private readonly logger = new Logger(RequirementProcessor.name);

  constructor(private readonly indexService: RequirementIndexService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case QueueJob.REQUIREMENT_INDEX: {
        const { pageIds } = job.data as IRequirementIndexJob;
        for (const pageId of pageIds ?? []) {
          await this.indexService.indexPage(pageId);
        }
        break;
      }
      default:
        this.logger.warn(`Unknown job: ${job.name}`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `Requirement job ${job.name} (${job.id}) failed: ${err.message}`,
    );
  }
}
