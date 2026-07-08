import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, '..');
const componentsRoot = __dirname;

describe('legacy component boundary', () => {
  it('keeps MobileView out of the production components root', () => {
    expect(existsSync(resolve(componentsRoot, 'MobileView.tsx'))).toBe(false);
    expect(existsSync(resolve(componentsRoot, 'legacy', 'MobileView.tsx'))).toBe(true);
    expect(existsSync(resolve(componentsRoot, 'legacy', 'README.md'))).toBe(true);
  });

  it('keeps the production app shell from importing legacy demo surfaces', () => {
    const appSource = readFileSync(resolve(srcRoot, 'App.tsx'), 'utf8');
    const navigationSource = readFileSync(resolve(srcRoot, 'navigation.ts'), 'utf8');

    expect(appSource).not.toMatch(/MobileView|components\/legacy|\.\/components\/legacy/);
    expect(navigationSource).not.toMatch(/MobileView|components\/legacy|mobile|warehouse/);
  });
});
