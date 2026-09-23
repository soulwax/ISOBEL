// File: src/utils/debug.ts

import createDebug, { type Debugger } from 'debug';
import { redactUnknown } from './redact-secrets.js';

/**
 * A logger that also reports whether its namespace is switched on, so callers
 * on a hot path can skip building a message that would only be thrown away.
 */
export type DebugLogger = ((...args: unknown[]) => void) & {readonly enabled: boolean};

/**
 * Redaction runs three global regexes over every string argument, so it has to
 * happen behind the enabled check rather than in front of it - otherwise a
 * disabled namespace still pays for output nobody asked for.
 */
const wrap = (namespacedLogger: Debugger): DebugLogger => {
  const write = (...args: unknown[]): void => {
    if (!namespacedLogger.enabled) {
      return;
    }

    (namespacedLogger as unknown as (...args: unknown[]) => void)(...args.map((arg) => redactUnknown(arg)));
  };

  // A getter, not a copied boolean: debug.enable() can flip a namespace on at
  // runtime and callers checking .enabled should see that.
  return Object.defineProperty(write, 'enabled', {
    get: () => namespacedLogger.enabled,
  }) as DebugLogger;
};

/**
 * Creates a logger under its own namespace, so one category can be enabled
 * without the rest: DEBUG=ISOBEL:audio prints playback telemetry only.
 */
export const createNamespacedDebug = (namespace: string): DebugLogger => wrap(createDebug(`ISOBEL:${namespace}`));

export default wrap(createDebug('ISOBEL'));
