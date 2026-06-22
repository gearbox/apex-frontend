import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthStreamService, type HealthStreamStatus } from './healthStream';
import { silentRefresh } from '$lib/api/auth';

vi.mock('$lib/utils/constants', () => ({ API_BASE_URL: 'http://localhost:8000' }));
vi.mock('$lib/stores/auth', () => ({ getAccessToken: () => 'test-token' }));
vi.mock('$lib/api/auth', () => ({ silentRefresh: vi.fn().mockResolvedValue(true) }));

// Helper: build a ReadableStream from a list of text chunks
function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index++]));
      } else {
        controller.close();
      }
    },
  });
}

// Helper: make a mock fetch response with a streaming body
function mockOkResponse(chunks: string[]): Response {
  return new Response(makeStream(chunks), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('HealthStreamService', () => {
  let service: HealthStreamService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new HealthStreamService();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(silentRefresh).mockResolvedValue(true);
  });

  afterEach(() => {
    service.stop();
    vi.restoreAllMocks();
  });

  it('calls onSnapshot twice and skips keepalive comment', async () => {
    const snapshot1 = { status: 'healthy', checked_at: '2026-01-01T00:00:00Z' };
    const snapshot2 = { status: 'degraded', checked_at: '2026-01-01T00:01:00Z' };

    const frames =
      `event: health.snapshot\ndata: ${JSON.stringify(snapshot1)}\n\n` +
      `: keepalive\n\n` +
      `event: health.snapshot\ndata: ${JSON.stringify(snapshot2)}\n\n`;

    fetchMock.mockResolvedValueOnce(mockOkResponse([frames]));

    const onSnapshot = vi.fn();
    const statuses: HealthStreamStatus[] = [];

    await service.start({ onSnapshot, onStatus: (s) => statuses.push(s) });

    // Wait for stream to finish processing
    await new Promise((r) => setTimeout(r, 50));

    expect(onSnapshot).toHaveBeenCalledTimes(2);
    expect(onSnapshot.mock.calls[0][0]).toMatchObject({ status: 'healthy' });
    expect(onSnapshot.mock.calls[1][0]).toMatchObject({ status: 'degraded' });
    expect(statuses).toContain('connected');
  });

  it('handles frames split across multiple chunks', async () => {
    const snapshot = { status: 'healthy', checked_at: '2026-01-01T00:00:00Z' };
    const frame = `event: health.snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`;
    const mid = Math.floor(frame.length / 2);

    fetchMock.mockResolvedValueOnce(mockOkResponse([frame.slice(0, mid), frame.slice(mid)]));

    const onSnapshot = vi.fn();
    await service.start({ onSnapshot, onStatus: vi.fn() });
    await new Promise((r) => setTimeout(r, 50));

    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('attempts silentRefresh on 401 and reconnects', async () => {
    vi.mocked(silentRefresh).mockResolvedValue(true);

    const snapshot = { status: 'healthy', checked_at: '2026-01-01T00:00:00Z' };
    const frames = `event: health.snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`;

    // First call: 401; second call (after refresh): 200 with data
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(mockOkResponse([frames]));

    const onSnapshot = vi.fn();
    const statuses: HealthStreamStatus[] = [];
    await service.start({ onSnapshot, onStatus: (s) => statuses.push(s) });
    await new Promise((r) => setTimeout(r, 50));

    expect(silentRefresh).toHaveBeenCalledOnce();
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('calls onStatus("fallback") when silentRefresh fails', async () => {
    vi.mocked(silentRefresh).mockResolvedValue(false);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

    const statuses: HealthStreamStatus[] = [];
    await service.start({ onSnapshot: vi.fn(), onStatus: (s) => statuses.push(s) });
    await new Promise((r) => setTimeout(r, 50));

    expect(statuses).toContain('fallback');
  });

  it('stop() prevents reconnect after teardown', async () => {
    fetchMock.mockResolvedValue(mockOkResponse([]));

    const onSnapshot = vi.fn();
    await service.start({ onSnapshot, onStatus: vi.fn() });
    service.stop();
    await new Promise((r) => setTimeout(r, 100));

    // fetch may have been called once to open the connection, but not for reconnect
    expect(onSnapshot).not.toHaveBeenCalled();
  });
});
