import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { __resetTaro } from './taro-runtime';

beforeEach(() => {
  __resetTaro();
});

afterEach(() => {
  cleanup();
});
