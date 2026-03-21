/**
 * Shared Anthropic SDK mock helpers for test files.
 *
 * Due to Vitest's hoisting constraints, `vi.hoisted()` and `vi.mock()` calls
 * must remain in each consuming test file. This helper exports the reusable
 * MockAPIError class and a factory to build the mock constructor.
 */

/** Mock APIError matching the shape checked by `instanceof Anthropic.APIError`. */
export class MockAPIError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}

/**
 * Build a mock Anthropic constructor suitable for `vi.mock('@anthropic-ai/sdk')`.
 * Returns an object with `default` (the constructor) that wires `messages.create`
 * to the provided `mockCreate` fn and attaches `MockAPIError` as `APIError`.
 */
export function createSdkMock(mockCreate: ReturnType<typeof import('vitest').vi.fn>): { default: unknown } {
  const MockAnthropic = function MockAnthropic() {
    return { messages: { create: mockCreate } };
  };
  (MockAnthropic as unknown as Record<string, unknown>)['APIError'] = MockAPIError;
  return { default: MockAnthropic };
}
