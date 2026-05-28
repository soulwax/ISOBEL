// File: web/src/auth/index.ts

import { Auth } from '@auth/core';
import { authConfig } from './config.js';

// Framework-agnostic Auth.js handler used by the Express API bridge.
export async function authHandler(request: Request): Promise<Response> {
  return Auth(request, authConfig);
}

export const handlers = {
  GET: authHandler,
  POST: authHandler,
};
