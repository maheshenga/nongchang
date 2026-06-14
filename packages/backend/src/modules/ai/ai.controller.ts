import { BadRequestException, Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

interface MulterFile { buffer: Buffer }

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

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  transcribe(@CurrentUser() user: AuthUser, @UploadedFile() file?: MulterFile) {
    if (!file?.buffer) throw new BadRequestException('缺少音频文件');
    return this.svc.transcribe(user, file.buffer);
  }
}
