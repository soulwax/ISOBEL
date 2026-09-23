// File: src/utils/ffmpeg-capabilities.ts

import { execa } from 'execa';
import { FFMPEG_READRATE_BURST_MIN_MAJOR, FFMPEG_READRATE_BURST_MIN_MINOR } from './constants.js';
import debug from './debug.js';

const VERSION_PATTERN = /ffmpeg version (\d+)\.(\d+)/;

let cachedResult: Promise<boolean> | undefined;

async function detectSupportsInitialBurst(): Promise<boolean> {
  let stdout: string;
  try {
    ({ stdout } = await execa('ffmpeg', ['-version']));
  } catch (error) {
    debug(`Could not run ffmpeg -version; disabling -readrate_initial_burst: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }

  const match = VERSION_PATTERN.exec(stdout);
  if (!match) {
    debug(`ffmpeg -version output did not match the expected format; disabling -readrate_initial_burst: ${stdout.split('\n')[0]}`);
    return false;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const supported = major > FFMPEG_READRATE_BURST_MIN_MAJOR
    || (major === FFMPEG_READRATE_BURST_MIN_MAJOR && minor >= FFMPEG_READRATE_BURST_MIN_MINOR);

  if (supported) {
    debug(`ffmpeg ${major}.${minor} supports -readrate_initial_burst`);
  } else {
    debug(`ffmpeg ${major}.${minor} predates ${FFMPEG_READRATE_BURST_MIN_MAJOR}.${FFMPEG_READRATE_BURST_MIN_MINOR}; falling back to -readrate only`);
  }

  return supported;
}

/**
 * Whether the ffmpeg binary on PATH accepts -readrate_initial_burst.
 * Cached for the process lifetime: the binary can't change while running.
 */
export function supportsReadrateInitialBurst(): Promise<boolean> {
  cachedResult ??= detectSupportsInitialBurst();
  return cachedResult;
}
