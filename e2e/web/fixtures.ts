import { expect, type Page } from '@playwright/test';

type CredentialName = 'E2E_TENANT_CODE' | 'E2E_USERNAME' | 'E2E_PASSWORD' | 'E2E_BILLING_USERNAME';

function required(name: CredentialName): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}; browser credentials must be supplied at runtime.`);
  return value;
}

export function runtimeCredentials() {
  return {
    tenantCode: required('E2E_TENANT_CODE'),
    username: required('E2E_USERNAME'),
    password: required('E2E_PASSWORD'),
    billingUsername: required('E2E_BILLING_USERNAME'),
  };
}

export async function loginByApi(page: Page, username = runtimeCredentials().username): Promise<void> {
  const credentials = runtimeCredentials();
  const response = await page.request.post('/api/auth/web/login', {
    data: {
      tenantCode: credentials.tenantCode,
      username,
      password: credentials.password,
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('button', { name: '退出' })).toBeVisible();
}
