import { http, HttpResponse } from 'msw';
import { makeGalleryPage } from '../factories/gallery';
import { MOCK_BASE_URL as BASE } from '../config';

export const galleryHandlers = [
  http.get(`${BASE}/v1/users/me/jobs`, () => HttpResponse.json(makeGalleryPage(5))),
];
