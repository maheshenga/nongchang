import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { SessionValidationCacheService } from '../../auth/session-validation-cache.service';
import { RuntimeStateModule } from '../../common/runtime/runtime-state.module';
import { PrismaService } from '../../prisma/prisma.service';
import { UserGroupModule } from './user-group.module';
import { UserGroupService } from './user-group.service';

describe('UserGroupModule', () => {
  it('fails compilation when the required session cache dependency is omitted', async () => {
    const testingModule = Test.createTestingModule({
      providers: [
        UserGroupService,
        { provide: PrismaService, useValue: {} },
      ],
    });

    await expect(testingModule.compile()).rejects.toThrow(
      new RegExp(SessionValidationCacheService.name),
    );
  });

  it('imports RuntimeStateModule explicitly', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, UserGroupModule) as unknown[] | undefined;

    expect(Array.isArray(imports) && imports.includes(RuntimeStateModule)).toBe(true);
  });
});
