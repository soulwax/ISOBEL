// File: src/utils/debug.ts

import createDebug from 'debug';
import { redactUnknown } from './redact-secrets.js';

const logger = createDebug('ISOBEL');
const log = logger as unknown as (...args: unknown[]) => void;

export default (...args: unknown[]): void => {
  log(...args.map((arg) => redactUnknown(arg)));
};
