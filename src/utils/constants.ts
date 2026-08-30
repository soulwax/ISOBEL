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
export const PROGRESS_BAR_SEGMENTS = 16;

/**
 * Seconds skipped by the rewind/fast-forward playback buttons
 */
export const SEEK_STEP_SECONDS = 15;

/**
 * Volume percentage step for the volume up/down playback buttons
 */
export const VOLUME_STEP = 10;

/**
 * Read-ahead pacing for network inputs.
 *
 * ffmpeg bursts this many seconds of input as fast as the source allows, then
 * settles to STREAM_READ_RATE. The burst builds a cushion the audio player can
 * drain during network jitter; the rate keeps rebuilding it without pulling
 * whole tracks that may be skipped.
 */
export const STREAM_READ_BURST_SECONDS = 15;
export const STREAM_READ_RATE = 1.5;

/**
 * Upper bound for the Opus encoder, in kbps.
 *
 * The voice channel advertises its own bitrate and that wins when it is lower.
 * Past this point Opus gains very little on 48 kHz stereo music, while the
 * larger packets cost more on a lossy link than the fidelity is worth.
 */
export const OPUS_MAX_BITRATE_KBPS = 128;

/**
 * Fallback bitrate in kbps when the voice channel's own bitrate is unknown.
 * Matches Discord's default for unboosted guilds.
 */
export const OPUS_FALLBACK_BITRATE_KBPS = 64;

/**
 * Expected packet loss percentage used to size libopus in-band FEC.
 * Only meaningful on the passthrough path, where our packets are the ones
 * listeners receive.
 */
export const OPUS_EXPECTED_PACKET_LOSS_PERCENT = 5;

/**
 * Discord voice is 48 kHz stereo; state it explicitly rather than letting the
 * encoder infer it from whatever the source happens to be.
 */
export const DISCORD_SAMPLE_RATE_HZ = 48_000;
export const DISCORD_CHANNEL_COUNT = 2;

/**
 * Bytes per second of signed 16-bit PCM at Discord's sample rate, used to
 * convert produced bytes into seconds of cushion on the PCM path.
 */
export const PCM_BYTES_PER_SECOND = DISCORD_SAMPLE_RATE_HZ * DISCORD_CHANNEL_COUNT * 2;

/**
 * How long to wait for further volume changes before respawning the stream on
 * the passthrough path, so dragging a volume slider respawns once.
 */
export const VOLUME_RESPAWN_DEBOUNCE_MS = 400;

/**
 * How often playback telemetry (buffer cushion, playback drift) is sampled.
 */
export const PLAYBACK_TELEMETRY_INTERVAL_MS = 1000;

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
