// File: src/utils/event-loop-lag.ts

import { createHistogram, performance } from 'node:perf_hooks';
import { PLAYBACK_TELEMETRY_INTERVAL_MS } from './constants.js';

export interface EventLoopLag {
  /** 99th-percentile timer delay over the last window, in milliseconds. */
  p99Ms: number;
  /** Worst timer delay over the last window, in milliseconds. */
  maxMs: number;
}

// @discordjs/voice sends every 20 ms Opus packet from a timer on this thread,
// so a late timer means late, bunched packets - micro-stutter for listeners
// that the "lost" figure can't see, because the packets do all go out
// eventually. One sampler serves the whole process.
//
// Not monitorEventLoopDelay: its reset() also forgets the previous timestamp,
// so the first delay after every reset is silently dropped. Rolling the window
// once a second would then miss any stall that began right after a roll.
const SAMPLE_INTERVAL_MS = 10;

let histogram: ReturnType<typeof createHistogram> | null = null;
let windowStartedAt = 0;
let latest: EventLoopLag = {p99Ms: 0, maxMs: 0};

const toMs = (nanoseconds: number) => Math.round(nanoseconds / 1e5) / 10;

function startSampling(): ReturnType<typeof createHistogram> {
  const recorder = createHistogram();
  let expectedAt = performance.now() + SAMPLE_INTERVAL_MS;

  const sample = () => {
    const now = performance.now();
    // record() needs a positive integer; nanoseconds keep sub-ms precision.
    recorder.record(Math.max(1, Math.round((now - expectedAt) * 1e6)));
    expectedAt = now + SAMPLE_INTERVAL_MS;
    setTimeout(sample, SAMPLE_INTERVAL_MS).unref();
  };

  setTimeout(sample, SAMPLE_INTERVAL_MS).unref();
  return recorder;
}

/**
 * Timer lag over roughly the last telemetry interval. Started on first use, so
 * it costs nothing unless someone is watching the audio telemetry.
 *
 * Every playing guild calls this once per tick; the window only rolls over
 * once per interval, so they all see the same figures instead of each reset
 * leaving the next caller a near-empty window.
 */
export function readEventLoopLag(): EventLoopLag {
  const now = Date.now();

  if (!histogram) {
    histogram = startSampling();
    windowStartedAt = now;
    return latest;
  }

  if (now - windowStartedAt >= PLAYBACK_TELEMETRY_INTERVAL_MS * 0.9) {
    latest = {
      p99Ms: histogram.count > 0 ? toMs(histogram.percentile(99)) : 0,
      maxMs: histogram.count > 0 ? toMs(histogram.max) : 0,
    };
    histogram.reset();
    windowStartedAt = now;
  }

  return latest;
}
