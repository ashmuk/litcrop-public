import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadImage } from '../upload';

const PLOT_ID = 'a0000000-0000-0000-0000-000000000001';
const API_URL = 'http://localhost:3000';

// Valid JPEG buffer
const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(100).fill(0)]);

const successResponse = {
  id: 'e0000000-0000-0000-0000-000000000001',
  url: 'https://example.com/signed',
  captured_at: '2026-03-17T10:00:00.000Z',
  uploaded_at: '2026-03-17T10:00:01.000Z',
  storage_key: 'images/f/p/2026/03/17/e.jpg',
  trigger: 'scheduled',
  size_bytes: 104,
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers();
});

// ── Retry logic ───────────────────────────────────────────────────

describe('uploadImage retry logic', () => {
  it('succeeds on first attempt → attempts: 1', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(successResponse),
    }));

    const promise = uploadImage({
      apiBaseUrl: API_URL,
      plotId: PLOT_ID,
      imageBuffer: jpegBuffer,
      triggerType: 'scheduled',
      nodeId: 'cam-001',
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.data).toEqual(successResponse);
  });

  it('fails first two attempts, succeeds on third → attempts: 3', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('Server Error'), status: 500 })
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('Server Error'), status: 500 })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(successResponse) });
    vi.stubGlobal('fetch', mockFetch);

    const promise = uploadImage({
      apiBaseUrl: API_URL,
      plotId: PLOT_ID,
      imageBuffer: jpegBuffer,
      triggerType: 'motion',
      nodeId: 'cam-001',
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('all three attempts fail → success: false, attempts: 3', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('Internal Server Error'),
      status: 500,
    }));

    const promise = uploadImage({
      apiBaseUrl: API_URL,
      plotId: PLOT_ID,
      imageBuffer: jpegBuffer,
      triggerType: 'scheduled',
      nodeId: 'cam-001',
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('appends "trigger" field (not trigger_type) to FormData', async () => {
    let capturedFormData: FormData | undefined;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedFormData = init.body as FormData;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(successResponse) });
    }));

    const promise = uploadImage({
      apiBaseUrl: API_URL,
      plotId: PLOT_ID,
      imageBuffer: jpegBuffer,
      triggerType: 'scheduled',
      nodeId: 'cam-001',
    });
    await vi.runAllTimersAsync();
    await promise;

    expect(capturedFormData).toBeDefined();
    expect(capturedFormData!.get('trigger')).toBe('scheduled');
    expect(capturedFormData!.get('trigger_type')).toBeNull();
  });

  it('uses exponential delay: 1s then 2s between retries', async () => {
    // Three failures
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('error'),
      status: 500,
    }));

    const advanceTimerSpy = vi.spyOn(global, 'setTimeout');

    const promise = uploadImage({
      apiBaseUrl: API_URL,
      plotId: PLOT_ID,
      imageBuffer: jpegBuffer,
      triggerType: 'scheduled',
      nodeId: 'cam-001',
    });
    await vi.runAllTimersAsync();
    await promise;

    // Delays are: 1000ms (after attempt 1), 2000ms (after attempt 2)
    const delays = advanceTimerSpy.mock.calls.map((call) => call[1]);
    expect(delays).toContain(1000);
    expect(delays).toContain(2000);
  });
});
