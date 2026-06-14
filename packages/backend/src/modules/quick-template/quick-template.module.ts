import { Module } from '@nestjs/common';
import { QuickTemplateService } from './quick-template.service';
import { QuickTemplateController } from './quick-template.controller';

@Module({
  providers: [QuickTemplateService],
  controllers: [QuickTemplateController],
})
export class QuickTemplateModule {}
