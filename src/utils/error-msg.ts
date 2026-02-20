// File: src/utils/error-msg.ts

import { redactSecrets } from './redact-secrets.js';

export default (error?: string | Error): string => {
  let str = 'unknown error';

  if (error) {
    if (typeof error === 'string') {
      str = `🚫 ope: ${redactSecrets(error)}`;
    } else if (error instanceof Error) {
      str = `🚫 ope: ${redactSecrets(error.message)}`;
    }
  }

  return str;
};
