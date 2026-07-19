import { authHandlers } from './auth';
import { userHandlers } from './users';
import { jobHandlers } from './jobs';
import { libraryHandlers } from './library';
import { billingHandlers } from './billing';
import { adminHandlers } from './admin';
import { eventHandlers } from './events';
import { storageHandlers } from './storage';
import { sessionHandlers } from './sessions';
import { pushHandlers } from './push';
import { frameHandlers } from './frames';

export const handlers = [
  ...authHandlers,
  ...userHandlers,
  ...jobHandlers,
  ...libraryHandlers,
  ...billingHandlers,
  ...adminHandlers,
  ...eventHandlers,
  ...storageHandlers,
  ...sessionHandlers,
  ...pushHandlers,
  ...frameHandlers,
];
