import { API_BASE_URL } from '$lib/utils/constants';
import { getAccessToken } from '$lib/stores/auth';
import { silentRefresh } from '$lib/api/auth';
import type { DetailedHealthResponse } from '$lib/api/admin';

export type HealthStreamStatus = 'connecting' | 'connected' | 'fallback' | 'disconnected';

export interface HealthStreamCallbacks {
  onSnapshot: (snapshot: DetailedHealthResponse) => void;
  onStatus: (status: HealthStreamStatus) => void;
}

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

export class HealthStreamService {
  private abortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private consecutiveFailures = 0;

  async start(callbacks: HealthStreamCallbacks): Promise<void> {
    if (typeof window === 'undefined') return;
    this.stopped = false;
    await this.connect(callbacks, false);
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async connect(callbacks: HealthStreamCallbacks, isRetry: boolean): Promise<void> {
    if (this.stopped) return;
    if (!isRetry) {
      callbacks.onStatus('connecting');
    }

    this.abortController = new AbortController();

    try {
      const res = await fetch(`${API_BASE_URL}/v1/admin/health/stream`, {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
          Accept: 'text/event-stream',
        },
        signal: this.abortController.signal,
      });

      if (this.stopped) return;

      if (res.status === 401) {
        const refreshed = await silentRefresh();
        if (!refreshed || this.stopped) {
          callbacks.onStatus('fallback');
          return;
        }
        // Reconnect once with the refreshed token
        this.abortController = new AbortController();
        const retryRes = await fetch(`${API_BASE_URL}/v1/admin/health/stream`, {
          headers: {
            Authorization: `Bearer ${getAccessToken()}`,
            Accept: 'text/event-stream',
          },
          signal: this.abortController.signal,
        });
        if (this.stopped) return;
        if (!retryRes.ok) {
          callbacks.onStatus('fallback');
          return;
        }
        await this.readStream(retryRes, callbacks);
        return;
      }

      if (!res.ok) {
        this.handleFailure(callbacks);
        return;
      }

      this.consecutiveFailures = 0;
      callbacks.onStatus('connected');
      await this.readStream(res, callbacks);
    } catch (err) {
      if (this.stopped) return;
      // AbortError = intentional stop, not a failure
      if (err instanceof DOMException && err.name === 'AbortError') return;
      this.handleFailure(callbacks);
    }
  }

  private async readStream(res: Response, callbacks: HealthStreamCallbacks): Promise<void> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (this.stopped) break;
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          if (frame.startsWith(':')) continue;
          const lines = frame.split('\n');
          const event = lines
            .find((l) => l.startsWith('event:'))
            ?.slice(6)
            .trim();
          const dataLine = lines
            .find((l) => l.startsWith('data:'))
            ?.slice(5)
            .trim();
          if (event === 'health.snapshot' && dataLine) {
            try {
              callbacks.onSnapshot(JSON.parse(dataLine) as DetailedHealthResponse);
            } catch {
              // ignore malformed frame
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!this.stopped) {
      this.handleFailure(callbacks);
    }
  }

  private handleFailure(callbacks: HealthStreamCallbacks): void {
    if (this.stopped) return;
    this.consecutiveFailures++;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.consecutiveFailures - 1),
      RECONNECT_MAX_MS,
    );
    callbacks.onStatus('connecting');
    this.scheduleReconnect(delay, callbacks);
  }

  private scheduleReconnect(delayMs: number, callbacks: HealthStreamCallbacks): void {
    this.clearTimer();
    this.reconnectTimer = setTimeout(() => {
      if (!this.stopped) this.connect(callbacks, true);
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
