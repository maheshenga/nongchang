import { Body, Controller, Post } from '@nestjs/common';
import {
  AuthUser,
  AiChatInput,
  AiDiagnoseInput,
  aiChatSchema,
  aiDiagnoseSchema,
} from '@nongchang/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private svc: AiService) {}

  @Post('chat')
  chat(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(aiChatSchema)) dto: AiChatInput) {
    return this.svc.chat(user, dto.message);
  }

  @Post('diagnose')
  diagnose(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(aiDiagnoseSchema)) dto: AiDiagnoseInput) {
    return this.svc.diagnose(user, dto);
  }
}
