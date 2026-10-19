import { PersonalSpaceService } from './services/personal-space.service';
import { Module } from '@nestjs/common';
import { SpaceService } from './services/space.service';
import { SpaceController } from './space.controller';
import { SpaceMemberService } from './services/space-member.service';

@Module({
  imports: [],
  controllers: [SpaceController],
  providers: [SpaceService, SpaceMemberService, PersonalSpaceService],
  exports: [SpaceService, SpaceMemberService, PersonalSpaceService],
})
export class SpaceModule {}
