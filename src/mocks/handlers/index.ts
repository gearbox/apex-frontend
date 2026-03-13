import { authHandlers } from './auth';
import { userHandlers } from './users';
import { jobHandlers } from './jobs';
import { galleryHandlers } from './gallery';
import { billingHandlers } from './billing';
import { adminHandlers } from './admin';

export const handlers = [
  ...authHandlers,
  ...userHandlers,
  ...jobHandlers,
  ...galleryHandlers,
  ...billingHandlers,
  ...adminHandlers,
];
