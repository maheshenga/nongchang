import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function login(app: INestApplication, username: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ tenantCode: 'DEMO', username, password: 'password123' })
    .expect(201);
  return response.body.accessToken;
}

describe('User group security e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let systemToken: string;
  let agentToken: string;
  let managedGroupId: string | undefined;
  let temporaryTenantId: string | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    systemToken = await login(app, 'sysadmin');
    agentToken = await login(app, 'agentA');

    const created = await request(app.getHttpServer())
      .post('/api/user-groups')
      .set('Authorization', `Bearer ${systemToken}`)
      .send({ name: `security-e2e-${Date.now()}`, permissions: ['record:view'] })
      .expect(201);
    managedGroupId = created.body.id;
  });

  afterAll(async () => {
    if (managedGroupId) await prisma.userGroup.deleteMany({ where: { id: managedGroupId } });
    if (temporaryTenantId) {
      await prisma.userGroup.deleteMany({ where: { tenantId: temporaryTenantId } });
      await prisma.tenant.deleteMany({ where: { id: temporaryTenantId } });
    }
    await app.close();
  });

  it('agent admin may list groups but may not create, update, or delete them', async () => {
    await request(app.getHttpServer())
      .get('/api/user-groups')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/user-groups')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ name: 'forbidden-agent-group', permissions: [] })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/user-groups/${managedGroupId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ name: 'forbidden-rename' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/user-groups/${managedGroupId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(403);
  });

  it('database rejects a second default group for the same tenant', async () => {
    const tenant = await prisma.tenant.create({
      data: { name: 'User group uniqueness e2e', code: `UG-E2E-${Date.now()}` },
    });
    temporaryTenantId = tenant.id;

    await prisma.userGroup.create({
      data: { tenantId: tenant.id, name: 'Default A', isDefault: true, permissions: [] },
    });
    await expect(prisma.userGroup.create({
      data: { tenantId: tenant.id, name: 'Default B', isDefault: true, permissions: [] },
    })).rejects.toMatchObject({ code: 'P2002' });
  });
});
