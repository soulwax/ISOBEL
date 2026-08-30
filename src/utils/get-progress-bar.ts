// File: src/utils/get-progress-bar.ts

const ELAPSED_SEGMENT = '━';
const REMAINING_SEGMENT = '─';
const KNOB = '🔘';

/**
 * Renders a two-tone progress bar: played segments are heavy, remaining ones light,
 * with a knob marking the current position.
 * @param width - Total number of segments (knob included)
 * @param progress - Playback progress between 0 and 1
 */
export default (width: number, progress: number): string => {
  const segments = Math.max(1, Math.floor(width));
  const clampedProgress = Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : 0;
  const knobPosition = Math.min(segments - 1, Math.floor(segments * clampedProgress));

  return ELAPSED_SEGMENT.repeat(knobPosition) + KNOB + REMAINING_SEGMENT.repeat(segments - knobPosition - 1);
};
