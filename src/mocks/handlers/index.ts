import { authHandlers } from './auth';
import { userHandlers } from './users';
import { jobHandlers } from './jobs';
import { galleryHandlers } from './gallery';
import { billingHandlers } from './billing';

export const handlers = [
  ...authHandlers,
  ...userHandlers,
  ...jobHandlers,
  ...galleryHandlers,
  ...billingHandlers,
];
