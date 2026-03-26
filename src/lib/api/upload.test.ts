import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';

vi.mock('$lib/stores/auth', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
}));

import { uploadImage } from './upload';

// The MSW server is started/reset/stopped via src/tests/setup.ts

const UPLOAD_URL = 'http://localhost:8000/v1/storage/upload';

const mockUploadResponse = {
  id: 'upload_001',
  storage_key: 'users/mock/uploads/upload_001.jpg',
  filename: 'test.jpg',
  content_type: 'image/jpeg',
  size_bytes: 1000,
  created_at: '2025-01-01T00:00:00Z',
  expires_at: '2025-02-01T00:00:00Z',
};

describe('uploadImage', () => {
  it('sends request with auth header and returns UploadResponse', async () => {
    let capturedAuth: string | null = null;
    let capturedMethod: string = '';

    server.use(
      http.post(UPLOAD_URL, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        capturedMethod = request.method;
        return HttpResponse.json(mockUploadResponse, { status: 201 });
      }),
    );

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const result = await uploadImage(file);

    expect(result.id).toBe('upload_001');
    expect(capturedMethod).toBe('POST');
    expect(capturedAuth).toBe('Bearer mock-token');
  });

  it('throws ApiRequestError on non-ok response', async () => {
    server.use(
      http.post(UPLOAD_URL, () =>
        HttpResponse.json(
          { error: 'file_too_large', message: 'File must be under 20 MB', status_code: 400 },
          { status: 400 },
        ),
      ),
    );

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    await expect(uploadImage(file)).rejects.toMatchObject({
      error: 'file_too_large',
      message: 'File must be under 20 MB',
    });
  });

  it('throws ApiRequestError with fallback when response body is not JSON', async () => {
    server.use(
      http.post(UPLOAD_URL, () =>
        new HttpResponse('Internal Server Error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    );

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    await expect(uploadImage(file)).rejects.toMatchObject({
      status_code: 500,
    });
  });
});
