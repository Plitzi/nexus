import { vi } from 'vitest';
import createFetchMock from 'vitest-fetch-mock';

/**
 * How much slack the timing tests get. A shared CI runner (GitHub Actions sets `CI`) or a turbo run beside other
 * packages is a busy CPU, where a budget meant for a quiet machine fails on noise rather than on a regression.
 * `PERF_MULTIPLIER` overrides it either way.
 */
(globalThis as Record<string, unknown>).PERF_MULTIPLIER = Number(
  process.env.PERF_MULTIPLIER ?? (process.env.CI || process.env.TURBO_RUN ? 5 : 1)
);

const fetchMocker = createFetchMock(vi);
fetchMocker.enableMocks();

vi.stubGlobal(
  'ResizeObserver',
  vi.fn(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  }))
);

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: unknown) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
});
