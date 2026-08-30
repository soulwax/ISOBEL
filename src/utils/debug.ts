// File: src/utils/debug.ts

import createDebug from 'debug';
import { redactUnknown } from './redact-secrets.js';

const logger = createDebug('ISOBEL');
const log = logger as unknown as (...args: unknown[]) => void;

/**
 * Creates a logger under its own namespace, so one category can be enabled
 * without the rest: DEBUG=ISOBEL:audio prints playback telemetry only.
 */
export const createNamespacedDebug = (namespace: string): (...args: unknown[]) => void => {
  const namespacedLogger = createDebug(`ISOBEL:${namespace}`) as unknown as (...args: unknown[]) => void;

  return (...args: unknown[]): void => {
    namespacedLogger(...args.map((arg) => redactUnknown(arg)));
  };
};

export default (...args: unknown[]): void => {
  log(...args.map((arg) => redactUnknown(arg)));
};
