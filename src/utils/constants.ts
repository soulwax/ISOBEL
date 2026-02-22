// File: src/utils/constants.ts

export const ONE_HOUR_IN_SECONDS = 60 * 60;
export const ONE_MINUTE_IN_SECONDS = 1 * 60;

/**
 * Discord API constants
 */
export const DISCORD_API_VERSION = '10' as const;

/**
 * Discord autocomplete choice limit (maximum choices per autocomplete response)
 */
export const DISCORD_AUTOCOMPLETE_MAX_CHOICES = 25;

/**
 * Discord pagination limit (maximum items per page)
 */
export const DISCORD_PAGINATION_LIMIT = 25;

/**
 * Minimum cache key length requirement
 */
export const MIN_CACHE_KEY_LENGTH = 4;

/**
 * Volume constants
 */
export const VOLUME_MIN = 0;
export const VOLUME_MAX = 100;
export const VOLUME_DEFAULT = 100;

/**
 * Queue page size constants
 */
export const QUEUE_PAGE_SIZE_DEFAULT = 10;
export const QUEUE_PAGE_SIZE_MAX = 30;

/**
 * Progress bar segment count
 */
export const PROGRESS_BAR_SEGMENTS = 10;

/**
 * Audio player max missed frames (for livestreams)
 */
export const AUDIO_PLAYER_MAX_MISSED_FRAMES = 80;

/**
 * HTTP status code for gone/unavailable content
 */
export const HTTP_STATUS_GONE = 410;

/**
 * Interval for updating the now-playing embed (in milliseconds)
 * Set to 5 seconds to balance smoothness with Discord rate limits
 */
export const NOW_PLAYING_UPDATE_INTERVAL_MS = 5000;

/**
 * Audio bitrate in kbps for streaming
 * Increased to 320kbps for higher fidelity MP3 source
 */
export const AUDIO_BITRATE_KBPS = 320;

/**
 * Audio bitrate for Opus output (Discord voice requirement)
 * Set to 192kbps for good quality while maintaining compatibility
 */
export const OPUS_OUTPUT_BITRATE_KBPS = 192;

/**
 * FFmpeg start timeout in milliseconds
 * How long to wait for ffmpeg to emit its 'start' event before aborting
 */
export const FFMPEG_START_TIMEOUT_MS = 5000;

/**
 * Maximum playback error retry attempts before skipping the track
 */
export const PLAYBACK_ERROR_MAX_RETRIES = 2;

/**
 * Base delay in milliseconds for playback error exponential backoff
 */
export const PLAYBACK_ERROR_BACKOFF_BASE_MS = 300;

/**
 * Maximum voice reconnection attempts before giving up
 */
export const RECONNECT_MAX_ATTEMPTS = 5;

/**
 * Maximum delay in milliseconds for reconnection exponential backoff
 */
export const RECONNECT_MAX_DELAY_MS = 30_000;

/**
 * Base delay in milliseconds for reconnection exponential backoff
 */
export const RECONNECT_BACKOFF_BASE_MS = 1000;

/**
 * Maximum retries for creating a read stream (ffmpeg)
 */
export const STREAM_CREATE_MAX_RETRIES = 2;

/**
 * Base delay in milliseconds for stream creation retry backoff
 */
export const STREAM_CREATE_BACKOFF_BASE_MS = 250;
