import {
  HttpException,
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { catchError, finalize, throwError, type Observable } from 'rxjs';
import { requestIdFromHeader } from './request-id';

interface RequestLike {
  method?: string;
  url?: string;
  route?: { path?: string };
  headers?: Record<string, unknown>;
  user?: { tenantId?: unknown; userId?: unknown };
}

interface ResponseLike {
  statusCode?: number;
  setHeader(name: string, value: string): void;
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestLike>();
    const response = http.getResponse<ResponseLike>();
    const requestId = requestIdFromHeader(request.headers?.['x-request-id']);
    const startedAt = performance.now();
    let errorStatus: number | undefined;

    response.setHeader('X-Request-Id', requestId);

    return next.handle().pipe(
      catchError((error: unknown) => {
        errorStatus = error instanceof HttpException ? error.getStatus() : 500;
        return throwError(() => error);
      }),
      finalize(() => {
        const user = request.user;
        const payload = {
          requestId,
          method: request.method ?? 'UNKNOWN',
          path: request.route?.path ?? request.url?.split('?')[0] ?? '/',
          status: errorStatus ?? response.statusCode ?? 200,
          durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
          ...(typeof user?.tenantId === 'string' ? { tenantId: user.tenantId } : {}),
          ...(typeof user?.userId === 'string' ? { userId: user.userId } : {}),
        };
        this.logger.log(JSON.stringify(payload));
      }),
    );
  }
}
