import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { setReviewerTokenProvider, setUnauthorizedHandler } from '@/services/http/apiClient';

/**
 * Default reviewer token for unit tests that call reviewer-scoped APIs
 * directly (`services/review/reviewApi.test.ts`). Component tests that use
 * `makeStore` re-wire the provider to their own store; this default only
 * covers tests that never build a store.
 */
export const TEST_REVIEWER_TOKEN = 'test-reviewer-token';

beforeEach(() => {
  setReviewerTokenProvider(() => TEST_REVIEWER_TOKEN);
  setUnauthorizedHandler(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// jsdom has no layout engine; components that scroll or focus-trap rely on these.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
