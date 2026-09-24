import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** `env` validates at import time, so each case needs a fresh module instance. */
async function loadEnv(value?: string) {
  vi.resetModules();
  if (value === undefined) vi.stubEnv('VITE_API_BASE_URL', '');
  else vi.stubEnv('VITE_API_BASE_URL', value);
  return import('./env');
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe('env', () => {
  it('exposes the configured API base URL', async () => {
    const { env } = await loadEnv('http://api.example.test');
    expect(env.apiBaseUrl).toBe('http://api.example.test');
  });

  it('strips trailing slashes so paths join cleanly', async () => {
    const { env } = await loadEnv('http://api.example.test///');
    expect(env.apiBaseUrl).toBe('http://api.example.test');
  });

  it('trims surrounding whitespace', async () => {
    const { env } = await loadEnv('  http://api.example.test  ');
    expect(env.apiBaseUrl).toBe('http://api.example.test');
  });

  it('treats a missing or blank value as same-origin', async () => {
    // Empty is the deployed default: the control plane serves this build itself.
    expect((await loadEnv('')).env.apiBaseUrl).toBe('');
    expect((await loadEnv('   ')).env.apiBaseUrl).toBe('');
  });
});
