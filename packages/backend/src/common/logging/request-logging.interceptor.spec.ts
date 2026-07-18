import { BadRequestException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

function contextFixture() {
  const request = {
    method: 'POST',
    url: '/api/ai/chat?secret=DO_NOT_LOG',
    route: { path: '/ai/chat' },
    baseUrl: '/api',
    headers: {
      'x-request-id': 'client-request-1',
      authorization: 'Bearer DO_NOT_LOG',
      cookie: 'nc_refresh=DO_NOT_LOG',
    },
    body: { apiKey: 'DO_NOT_LOG', message: 'DO_NOT_LOG' },
    query: { secret: 'DO_NOT_LOG' },
    user: { tenantId: 'tenant-1', userId: 'user-1' },
  };
  const response = { statusCode: 201, setHeader: vi.fn() };
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  return { context, response };
}

describe('RequestLoggingInterceptor', () => {
  const log = vi.fn();
  const observeHttp = vi.fn();
  let interceptor: RequestLoggingInterceptor;

  beforeEach(() => {
    vi.clearAllMocks();
    interceptor = new RequestLoggingInterceptor({ observeHttp } as never);
    (interceptor as unknown as { logger: { log(value: string): void } }).logger = { log };
  });

  it('emits one allowlisted completion log and response request ID', async () => {
    const { context, response } = contextFixture();
    const next = { handle: () => of({ result: 'DO_NOT_LOG' }) } as CallHandler;

    await expect(lastValueFrom(interceptor.intercept(context, next))).resolves.toEqual({ result: 'DO_NOT_LOG' });

    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-request-1');
    expect(log).toHaveBeenCalledTimes(1);
    const serialized = log.mock.calls[0][0] as string;
    expect(serialized).not.toContain('DO_NOT_LOG');
    expect(JSON.parse(serialized)).toEqual({
      requestId: 'client-request-1',
      method: 'POST',
      path: '/ai/chat',
      status: 201,
      durationMs: expect.any(Number),
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
    expect(observeHttp).toHaveBeenCalledWith({
      method: 'POST',
      routeTemplate: '/api/ai/chat',
      rawUrl: '/api/ai/chat?secret=DO_NOT_LOG',
      statusCode: 201,
      durationSeconds: expect.any(Number),
    });
  });

  it('logs an HttpException status once without logging its message', async () => {
    const { context } = contextFixture();
    const next = {
      handle: () => throwError(() => new BadRequestException('DO_NOT_LOG')),
    } as CallHandler;

    await expect(lastValueFrom(interceptor.intercept(context, next))).rejects.toBeInstanceOf(BadRequestException);

    expect(log).toHaveBeenCalledTimes(1);
    const serialized = log.mock.calls[0][0] as string;
    expect(serialized).not.toContain('DO_NOT_LOG');
    expect(JSON.parse(serialized)).toMatchObject({ status: 400 });
  });
});
