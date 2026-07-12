import { BadRequestException, Body, Controller, Headers, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AuthUser,
  AiChatInput,
  AiDiagnoseInput,
  aiChatSchema,
  aiDiagnoseSchema,
  aiAdviceSchema,
  aiAskSchema,
  AiAdviceInput,
  AiAskInput,
} from '@nongchang/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MULTIPART_FILE_LIMITS } from '../../common/upload/upload-limits';
import { AiService } from './ai.service';
import { requireAiIdempotencyKey } from './ai-idempotency';

interface MulterFile { buffer: Buffer }

@Controller('ai')
export class AiController {
  constructor(private svc: AiService) {}

  @Post('chat')
  chat(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(aiChatSchema)) dto: AiChatInput, @Headers('idempotency-key') key?: string) {
    return this.svc.chat(user, dto.message, requireAiIdempotencyKey(key));
  }

  @Post('diagnose')
  diagnose(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(aiDiagnoseSchema)) dto: AiDiagnoseInput, @Headers('idempotency-key') key?: string) {
    return this.svc.diagnose(user, dto, requireAiIdempotencyKey(key));
  }

  @Post('advice')
  advice(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(aiAdviceSchema)) dto: AiAdviceInput, @Headers('idempotency-key') key?: string) {
    return this.svc.advice(user, dto, requireAiIdempotencyKey(key));
  }

  @Post('ask')
  ask(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(aiAskSchema)) dto: AiAskInput, @Headers('idempotency-key') key?: string) {
    return this.svc.ask(user, dto, requireAiIdempotencyKey(key));
  }

  @Post('transcribe')
  @UseInterceptors(
    FileInterceptor('file', { limits: { ...MULTIPART_FILE_LIMITS, fileSize: 10 * 1024 * 1024 } }),
  )
  transcribe(@CurrentUser() user: AuthUser, @UploadedFile() file?: MulterFile, @Headers('idempotency-key') key?: string) {
    if (!file?.buffer) throw new BadRequestException('缺少音频文件');
    return this.svc.transcribe(user, file.buffer, undefined, requireAiIdempotencyKey(key));
  }
}
