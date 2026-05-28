// File: src/utils/error-msg.ts

import { redactSecrets } from './redact-secrets.js';

/**
 * Extracts a human-readable message from an unknown error value.
 * Useful for normalizing caught errors in catch blocks.
 * @param error - The error to extract a message from
 * @returns A string representation of the error
 */
export const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'unknown error';
};

export default (error?: string | Error): string => {
  const message = error ? formatError(error) : 'unknown error';
  return `🚫 ope: ${redactSecrets(message)}`;
};
