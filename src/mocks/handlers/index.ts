import { authHandlers } from './auth';
import { userHandlers } from './users';
import { jobHandlers } from './jobs';
import { galleryHandlers } from './gallery';
import { billingHandlers } from './billing';
import { adminHandlers } from './admin';
import { eventHandlers } from './events';
import { storageHandlers } from './storage';
import { sessionHandlers } from './sessions';
import { pushHandlers } from './push';

export const handlers = [
  ...authHandlers,
  ...userHandlers,
  ...jobHandlers,
  ...galleryHandlers,
  ...billingHandlers,
  ...adminHandlers,
  ...eventHandlers,
  ...storageHandlers,
  ...sessionHandlers,
  ...pushHandlers,
];
