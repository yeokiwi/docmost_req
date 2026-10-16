import { Module } from '@nestjs/common';
import { PageModule } from '../page/page.module';
import { RequirementController } from './requirement.controller';
import { RequirementSettingsService } from './services/requirement-settings.service';
import { RequirementIndexService } from './services/requirement-index.service';
import { RequirementQueryService } from './services/requirement-query.service';
import { RequirementBaselineService } from './services/requirement-baseline.service';
import { RequirementTransferService } from './services/requirement-transfer.service';
import { RequirementSettingsRepo } from './repos/requirement-settings.repo';
import { RequirementRepo } from './repos/requirement.repo';
import { RequirementBaselineRepo } from './repos/requirement-baseline.repo';
import { RequirementListener } from './requirement.listener';
import { RequirementProcessor } from './requirement.processor';

@Module({
  imports: [PageModule],
  controllers: [RequirementController],
  providers: [
    RequirementSettingsService,
    RequirementIndexService,
    RequirementQueryService,
    RequirementBaselineService,
    RequirementTransferService,
    RequirementSettingsRepo,
    RequirementRepo,
    RequirementBaselineRepo,
    RequirementListener,
    RequirementProcessor,
  ],
  exports: [RequirementIndexService],
})
export class RequirementModule {}
