// File: src/services/player.ts

import {
  type AudioPlayer,
  type AudioPlayerState,
  AudioPlayerStatus, type AudioResource,
  createAudioPlayer,
  createAudioResource, type DiscordGatewayAdapterCreator,
  entersState,
  joinVoiceChannel,
  StreamType,
  type VoiceConnection,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import type { Setting } from '@prisma/client';
import shuffle from 'array-shuffle';
import { type Message, type Snowflake, type VoiceChannel } from 'discord.js';
import { FFmpeggy } from 'ffmpeggy';
import { WriteStream } from 'fs-capacitor';
import { hashSync } from 'hasha';
import { inject } from 'inversify';
import { pipeline } from 'node:stream/promises';
import { type Readable } from 'stream';
import { TYPES } from '../types.js';
import { buildPlaybackControls, buildPlayingMessageEmbed } from '../utils/build-embed.js';
import { AUDIO_BITRATE_KBPS, AUDIO_PLAYER_MAX_MISSED_FRAMES, DISCORD_CHANNEL_COUNT, DISCORD_SAMPLE_RATE_HZ, OPUS_EXPECTED_PACKET_LOSS_PERCENT, OPUS_FALLBACK_BITRATE_KBPS, OPUS_MAX_BITRATE_KBPS, PCM_BYTES_PER_SECOND, PLAYBACK_TELEMETRY_INTERVAL_MS, STREAM_READ_BURST_SECONDS, STREAM_READ_RATE, VOLUME_RESPAWN_DEBOUNCE_MS, FFMPEG_START_TIMEOUT_MS, HTTP_STATUS_GONE, NOW_PLAYING_UPDATE_INTERVAL_MS, PLAYBACK_ERROR_BACKOFF_BASE_MS, PLAYBACK_ERROR_MAX_RETRIES, RECONNECT_BACKOFF_BASE_MS, RECONNECT_MAX_ATTEMPTS, RECONNECT_MAX_DELAY_MS, STREAM_CREATE_BACKOFF_BASE_MS, STREAM_CREATE_MAX_RETRIES, VOLUME_DEFAULT, VOLUME_MAX } from '../utils/constants.js';
import ByteCounter from '../utils/byte-counter.js';
import debug from '../utils/debug.js';
import { formatError } from '../utils/error-msg.js';
import { getGuildSettings } from '../utils/get-guild-settings.js';
import type FileCacheProvider from './file-cache.js';
import type SongbirdNext from './songbird-next.js';
import type StarchildAPI from './starchild-api.js';

const configureFfmpeggy = (): void => {
  const ffmpeggy = FFmpeggy as unknown as {
    DefaultConfig?: {
      ffmpegBin?: string;
      ffprobeBin?: string;
    };
  };
  const defaultConfig = ffmpeggy.DefaultConfig;

  if (!defaultConfig) {
    return;
  }

  const ffmpegPath = process.env.FFMPEG_PATH?.trim();
  const ffprobePath = process.env.FFPROBE_PATH?.trim();

  if (!defaultConfig.ffmpegBin || defaultConfig.ffmpegBin.trim() === '') {
    defaultConfig.ffmpegBin = ffmpegPath && ffmpegPath.length > 0 ? ffmpegPath : 'ffmpeg';
  }

  if (!defaultConfig.ffprobeBin || defaultConfig.ffprobeBin.trim() === '') {
    defaultConfig.ffprobeBin = ffprobePath && ffprobePath.length > 0 ? ffprobePath : 'ffprobe';
  }
};

configureFfmpeggy();

export enum MediaSource {
  Starchild,
  HLS,
  YouTube,
  DiscordAttachment,
}

export interface QueuedPlaylist {
  title: string;
  source: string;
}

export interface SongMetadata {
  title: string;
  artist: string;
  url: string; // For YT, it's the video ID (not the full URI)
  length: number;
  offset: number;
  playlist: QueuedPlaylist | null;
  isLive: boolean;
  thumbnailUrl: string | null;
  source: MediaSource;
}
export interface QueuedSong extends SongMetadata {
  addedInChannelId: Snowflake;
  requestedBy: string;
}

export enum STATUS {
  PLAYING,
  PAUSED,
  IDLE,
}

export interface PlayerEvents {
  statusChange: (oldStatus: STATUS, newStatus: STATUS) => void;
}

export interface NowPlayingSnapshot {
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  position: number;
  length: number;
  isLive: boolean;
}


export const DEFAULT_VOLUME = VOLUME_DEFAULT;

export const LoopMode = {
  Off: 0,
  Track: 1,
  Queue: 2,
} as const;

export default class Player {
  public voiceConnection: VoiceConnection | null = null;
  public status = STATUS.PAUSED;
  public guildId: string;
  public loopCurrentSong = false;
  public loopCurrentQueue = false;
  private currentChannel: VoiceChannel | undefined;
  private queue: QueuedSong[] = [];
  private queuePosition = 0;
  private audioPlayer: AudioPlayer | null = null;
  private audioResource: AudioResource | null = null;
  private volume?: number;
  private defaultVolume: number = DEFAULT_VOLUME;
  private nowPlaying: QueuedSong | null = null;
  private playPositionInterval: NodeJS.Timeout | undefined;
  private telemetryInterval: NodeJS.Timeout | undefined;

  // Playback telemetry: how far ahead ffmpeg has encoded, and how much
  // playback time we lost to underruns. See startPlaybackTelemetry().
  private activeStreamMeter: ByteCounter | null = null;
  private activeStreamByteRate = 0;
  private lastPlaybackDurationMs = 0;
  private lastTelemetrySampleAt = 0;
  private lostPlaybackMs = 0;

  // When a guild ducks the music while people speak, gain has to change
  // mid-track, which needs PCM in the chain. Every other guild gets Opus
  // passthrough: ffmpeg's packets reach Discord without being decoded and
  // re-encoded on the way.
  private useLiveVolume = false;
  private volumeRespawnTimer: NodeJS.Timeout | null = null;
  private positionAtStreamStart = 0;

  private positionInSeconds = 0;
  private readonly fileCache: FileCacheProvider;
  private readonly starchildAPI: StarchildAPI;
  private readonly songbirdNext: SongbirdNext;
  private disconnectTimer: NodeJS.Timeout | null = null;
  private nowPlayingMessage: Message | null = null;
  private embedUpdateInterval: NodeJS.Timeout | undefined;

  private readonly channelToSpeakingUsers = new Map<string, Set<string>>();
  private readonly mp3CacheInFlight = new Map<string, Promise<string>>();
  private audioPlayerIdleHandler?: (oldState: AudioPlayerState, newState: AudioPlayerState) => void;
  private audioPlayerErrorHandler?: (error: Error) => void;
  private readonly preloadedStreamPaths = new Map<string, string>();
  private aiSuggestions: string[] = [];
  private playbackErrorAttempts = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private allowReconnect = false;

  constructor(
    fileCache: FileCacheProvider,
    guildId: string,
    @inject(TYPES.Services.StarchildAPI) starchildAPI: StarchildAPI,
    @inject(TYPES.Services.SongbirdNext) songbirdNext: SongbirdNext
  ) {
    this.fileCache = fileCache;
    this.guildId = guildId;
    this.starchildAPI = starchildAPI;
    this.songbirdNext = songbirdNext;
  }

  async connect(channel: VoiceChannel): Promise<void> {
    // Always get freshest default volume setting value
    const settings = await getGuildSettings(this.guildId);
    const {defaultVolume = DEFAULT_VOLUME} = settings;
    this.defaultVolume = defaultVolume;
    this.currentChannel = channel;
    await this.refreshVolumeMode(settings);

    this.voiceConnection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      selfDeaf: false,
      adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
    });

    this.allowReconnect = true;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();

    const guildSettings = await getGuildSettings(this.guildId);
    this.applyDefaultLoopMode(guildSettings.defaultLoopMode);

    this.voiceConnection.on('stateChange', (oldState, newState) => {
      // The UDP keepalive holds the NAT mapping open and tells Discord the
      // connection is still alive. Clearing it was a workaround for a bug in a
      // much older voice release; on 0.19 suppressing it invites mid-track
      // dropouts on long sessions. Kept behind an env flag so the old behaviour
      // can be restored without a redeploy if this turns out to be wrong.
      if (process.env.DISABLE_VOICE_KEEPALIVE?.trim() === 'true') {
        this.suppressUdpKeepAlive(oldState, newState);
      }

      if (newState.status === VoiceConnectionStatus.Ready) {
        this.reconnectAttempts = 0;
        this.registerVoiceActivityListener(guildSettings);
      }
    });

    await entersState(this.voiceConnection, VoiceConnectionStatus.Ready, 20_000);
  }

  disconnect(): void {
    this.allowReconnect = false;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    if (this.voiceConnection) {
      if (this.status === STATUS.PLAYING) {
        this.pause();
      }

      this.loopCurrentSong = false;
      this.voiceConnection.destroy();
      this.audioPlayer?.stop(true);

      this.voiceConnection = null;
      this.audioPlayer = null;
      this.audioResource = null;
    }
    this.stopEmbedUpdates();
  }

  async seek(positionSeconds: number): Promise<void> {
    this.status = STATUS.PAUSED;

    if (this.voiceConnection === null) {
      throw new Error('Not connected to a voice channel.');
    }

    const currentSong = this.getCurrent();

    if (!currentSong) {
      throw new Error('No song currently playing');
    }

    if (positionSeconds > currentSong.length) {
      throw new Error('Seek position is outside the range of the song.');
    }

    let realPositionSeconds = positionSeconds;
    let to: number | undefined;
    if (currentSong.offset !== undefined) {
      realPositionSeconds += currentSong.offset;
      to = currentSong.length + currentSong.offset;
    }

    const stream = await this.getStream(currentSong, {seek: realPositionSeconds, to});
    const audioPlayer = this.getOrCreateAudioPlayer();
    this.voiceConnection.subscribe(audioPlayer);
    this.playAudioPlayerResource(this.createAudioStream(stream));
    this.attachListeners();
    this.startTrackingPosition(positionSeconds);

    this.status = STATUS.PLAYING;
  }

  async forwardSeek(positionSeconds: number): Promise<void> {
    return this.seek(this.positionInSeconds + positionSeconds);
  }

  getPosition(): number {
    return this.positionInSeconds;
  }

  getNowPlayingSnapshot(): NowPlayingSnapshot | null {
    const song = this.getCurrent();
    if (!song || this.status !== STATUS.PLAYING) {
      return null;
    }

    return {
      title: song.title,
      artist: song.artist,
      thumbnailUrl: song.thumbnailUrl,
      position: this.positionInSeconds,
      length: song.length,
      isLive: song.isLive,
    };
  }

  async play(): Promise<void> {
    if (this.voiceConnection === null) {
      throw new Error('Not connected to a voice channel.');
    }

    const currentSong = this.getCurrent();

    if (!currentSong) {
      throw new Error('Queue empty.');
    }

    // Cancel any pending idle disconnection
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    // Resume from paused state
    if (this.status === STATUS.PAUSED && currentSong.url === this.nowPlaying?.url) {
      if (this.audioPlayer) {
        this.audioPlayer.unpause();
        this.status = STATUS.PLAYING;
        this.startTrackingPosition();
        return;
      }

      // Was disconnected, need to recreate stream
      if (!currentSong.isLive) {
        return this.seek(this.getPosition());
      }
    }

    try {
      await this.refreshVolumeMode();

      let positionSeconds: number | undefined;
      let to: number | undefined;
      if (currentSong.offset !== undefined) {
        positionSeconds = currentSong.offset;
        to = currentSong.length + currentSong.offset;
      }

      const stream = await this.getStream(currentSong, {seek: positionSeconds, to});
      const audioPlayer = this.getOrCreateAudioPlayer();
      this.voiceConnection.subscribe(audioPlayer);
      this.playAudioPlayerResource(this.createAudioStream(stream));

      this.attachListeners();

      const previousSong = this.nowPlaying;
      this.status = STATUS.PLAYING;
      this.nowPlaying = currentSong;
      this.playbackErrorAttempts = 0;

      const isNewSong = previousSong !== currentSong;

      // Always reset position when starting a different queued song.
      // If it's the same queue item, we're seeking/resuming, so preserve position.
      if (!isNewSong) {
        // Same song - preserve position (for seeking/resuming)
        this.startTrackingPosition(this.positionInSeconds);
      } else {
        // New song - reset position to start (or offset)
        this.startTrackingPosition(positionSeconds ?? 0);
        await this.rotateNowPlayingMessage();
      }

      // Start updating the embed periodically
      this.startEmbedUpdates();
      this.prefetchNextSong();
      if (isNewSong) {
        this.safeAsync(this.refreshAiSuggestions(currentSong));
      }
    } catch (error: unknown) {
      await this.forward(1);

      if (this.isHttpError(error, HTTP_STATUS_GONE) && currentSong) {
        const channelId = currentSong.addedInChannelId;

        if (channelId) {
          debug(`${currentSong.title} is unavailable`);
          return;
        }
      }

      throw error;
    }
  }

  pause(): void {
    if (this.status !== STATUS.PLAYING) {
      throw new Error('Not currently playing.');
    }

    this.status = STATUS.PAUSED;

    if (this.audioPlayer) {
      this.audioPlayer.pause();
    }

    this.stopTrackingPosition();
    this.stopEmbedUpdates();
  }

  async forward(skip: number): Promise<void> {
    this.manualForward(skip);

    try {
      if (this.getCurrent() && this.status !== STATUS.PAUSED) {
        await this.play();
      } else {
        this.status = STATUS.IDLE;
        this.audioPlayer?.stop(true);

        const settings = await getGuildSettings(this.guildId);

        const {secondsToWaitAfterQueueEmpties} = settings;
        if (secondsToWaitAfterQueueEmpties !== 0) {
          this.disconnectTimer = setTimeout(() => {
            // Make sure we are not accidentally playing
            // when disconnecting
            if (this.status === STATUS.IDLE) {
              this.disconnect();
            }
          }, secondsToWaitAfterQueueEmpties * 1000);
        }
      }
    } catch (error: unknown) {
      this.queuePosition--;
      throw error;
    }
  }

  registerVoiceActivityListener(guildSettings: Setting) {
    const {turnDownVolumeWhenPeopleSpeak, turnDownVolumeWhenPeopleSpeakTarget} = guildSettings;
    if (!turnDownVolumeWhenPeopleSpeak || !this.voiceConnection) {
      return;
    }

    this.voiceConnection.receiver.speaking.on('start', (userId: string) => {
      this.updateSpeakingUser(userId, 'add');
      this.suppressVoiceWhenPeopleAreSpeaking(turnDownVolumeWhenPeopleSpeakTarget);
    });

    this.voiceConnection.receiver.speaking.on('end', (userId: string) => {
      this.updateSpeakingUser(userId, 'remove');
      this.suppressVoiceWhenPeopleAreSpeaking(turnDownVolumeWhenPeopleSpeakTarget);
    });
  }

  /**
   * Updates the speaking users set for the current channel.
   * @param userId - The Discord user ID
   * @param action - Whether to 'add' or 'remove' the user from the speaking set
   */
  private updateSpeakingUser(userId: string, action: 'add' | 'remove'): void {
    if (!this.currentChannel) {
      return;
    }

    const member = this.currentChannel.members.get(userId);
    if (!member) {
      return;
    }

    const channelId = this.currentChannel.id;
    if (!this.channelToSpeakingUsers.has(channelId)) {
      this.channelToSpeakingUsers.set(channelId, new Set());
    }

    const speakingSet = this.channelToSpeakingUsers.get(channelId)!;
    if (action === 'add') {
      speakingSet.add(member.id);
    } else {
      speakingSet.delete(member.id);
    }
  }

  suppressVoiceWhenPeopleAreSpeaking(turnDownVolumeWhenPeopleSpeakTarget: number): void {
    if (!this.currentChannel) {
      return;
    }

    const speakingUsers = this.channelToSpeakingUsers.get(this.currentChannel.id);
    if (speakingUsers && speakingUsers.size > 0) {
      this.setVolume(turnDownVolumeWhenPeopleSpeakTarget);
    } else {
      this.setVolume(this.defaultVolume);
    }
  }

  canGoForward(skip: number) {
    return (this.queuePosition + skip - 1) < this.queue.length;
  }

  manualForward(skip: number): void {
    if (this.canGoForward(skip)) {
      this.queuePosition += skip;
      this.positionInSeconds = 0;
      this.stopTrackingPosition();
    } else {
      throw new Error('No songs in queue to forward to.');
    }
  }

  canGoBack() {
    return this.queuePosition - 1 >= 0;
  }

  async back(): Promise<void> {
    if (this.canGoBack()) {
      this.queuePosition--;
      this.positionInSeconds = 0;
      this.stopTrackingPosition();

      if (this.status !== STATUS.PAUSED) {
        await this.play();
      }
    } else {
      throw new Error('No songs in queue to go back to.');
    }
  }

  getCurrent(): QueuedSong | null {
    if (this.queue[this.queuePosition]) {
      return this.queue[this.queuePosition];
    }

    return null;
  }

  /**
   * Returns queue, not including the current song.
   * @returns {QueuedSong[]}
   */
  getQueue(): QueuedSong[] {
    return this.queue.slice(this.queuePosition + 1);
  }

  getActiveQueueSize(): number {
    return Math.max(0, this.queue.length - this.queuePosition);
  }

  add(song: QueuedSong, {immediate = false} = {}): void {
    if (song.playlist || !immediate) {
      // Add to end of queue
      this.queue.push(song);
    } else {
      // Add as the next song to be played
      const insertAt = this.queuePosition + 1;
      this.queue = [...this.queue.slice(0, insertAt), song, ...this.queue.slice(insertAt)];
    }
  }

  shuffle(): void {
    const shuffledSongs = shuffle(this.queue.slice(this.queuePosition + 1));

    this.queue = [...this.queue.slice(0, this.queuePosition + 1), ...shuffledSongs];
  }

  clear(): void {
    const newQueue = [];

    // Don't clear curently playing song
    const current = this.getCurrent();

    if (current) {
      newQueue.push(current);
    }

    this.queuePosition = 0;
    this.queue = newQueue;
  }

  removeFromQueue(index: number, amount = 1): void {
    this.queue.splice(this.queuePosition + index, amount);
  }

  removeCurrent(): void {
    this.queue = [...this.queue.slice(0, this.queuePosition), ...this.queue.slice(this.queuePosition + 1)];
  }

  queueSize(): number {
    return this.getQueue().length;
  }

  isQueueEmpty(): boolean {
    return this.queueSize() === 0;
  }

  stop(): void {
    this.stopEmbedUpdates();
    this.disconnect();
    this.queuePosition = 0;
    this.queue = [];
  }

  move(from: number, to: number): QueuedSong {
    if (from > this.queueSize() || to > this.queueSize()) {
      throw new Error('Move index is outside the range of the queue.');
    }

    this.queue.splice(this.queuePosition + to, 0, this.queue.splice(this.queuePosition + from, 1)[0]);

    return this.queue[this.queuePosition + to];
  }

  setVolume(level: number): void {
    // Level should be a number between 0 and 100 = 0% => 100%
    this.volume = level;

    if (this.useLiveVolume) {
      this.setAudioPlayerVolume(level);
      return;
    }

    // Passthrough has no volume transformer to talk to, so the new gain has to
    // be baked into a fresh ffmpeg process. Debounced, because a user holding
    // the volume button would otherwise respawn the stream on every press.
    this.scheduleVolumeRespawn();
  }

  private scheduleVolumeRespawn(): void {
    if (this.volumeRespawnTimer) {
      clearTimeout(this.volumeRespawnTimer);
    }

    this.volumeRespawnTimer = setTimeout(() => {
      this.volumeRespawnTimer = null;

      const currentSong = this.getCurrent();
      if (this.status !== STATUS.PLAYING || !currentSong || currentSong.isLive) {
        // Live streams cannot be restarted at a position; the new volume
        // applies from the next track.
        return;
      }

      this.safeAsync(this.seek(this.getPosition()));
    }, VOLUME_RESPAWN_DEBOUNCE_MS);
  }

  getVolume(): number {
    // Only use default volume if player volume is not already set (in the event of a reconnect we shouldn't reset)
    return this.volume ?? this.defaultVolume;
  }

  private getHashForCache(url: string): string {
    return hashSync(url);
  }

  /**
   * Downloads and caches MP3 file from Starchild API
   * @param song - The song to download
   * @returns Path to cached MP3 file
   */
  private async downloadAndCacheMP3(song: QueuedSong): Promise<string> {
    const cacheKey = `mp3:${song.url}:${AUDIO_BITRATE_KBPS}`;
    const hash = this.getHashForCache(cacheKey);

    const inFlight = this.mp3CacheInFlight.get(hash);
    if (inFlight) {
      return inFlight;
    }

    // Check if already cached
    const cachedPath = await this.fileCache.getPathFor(hash);
    if (cachedPath) {
      debug(`Using cached MP3 for ${song.title}`);
      return cachedPath;
    }

    const downloadPromise = (async () => {
      // Download MP3 file
      debug(`Downloading MP3 for ${song.title} at ${AUDIO_BITRATE_KBPS}kbps...`);

      try {
        const { stream: writeStream, committed } = this.fileCache.createWriteStream(hash);
        const downloadStream = this.starchildAPI.getStream(song.url, {
          kbps: AUDIO_BITRATE_KBPS as number,
        });

        // Wait for pipeline to complete
        await pipeline(downloadStream, writeStream);

        // Wait for the file to be moved from tmp and recorded in the database
        const finalPath = await committed;
        if (!finalPath) {
          throw new Error(`Failed to cache MP3 file - empty write for ${song.title}`);
        }

        debug(`Cached MP3 for ${song.title}`);
        return finalPath;
      } catch (error) {
        debug(`Error downloading/caching MP3 for ${String(song.title)}: ${formatError(error)}`);
        throw error;
      }
    })();

    this.mp3CacheInFlight.set(hash, downloadPromise);
    try {
      return await downloadPromise;
    } finally {
      this.mp3CacheInFlight.delete(hash);
    }
  }

  private async getStream(song: QueuedSong, options: {seek?: number; to?: number} = {}): Promise<Readable> {
    if (this.status === STATUS.PLAYING) {
      this.audioPlayer?.stop();
    } else if (this.status === STATUS.PAUSED) {
      this.audioPlayer?.stop(true);
    }

    if (song.source === MediaSource.HLS) {
      return this.createReadStreamWithRetry({url: song.url, cacheKey: song.url});
    }
    if (song.source === MediaSource.YouTube || song.source === MediaSource.DiscordAttachment) {
      const ffmpegInputOptions: string[] = [];
      if (options.seek) {
        ffmpegInputOptions.push('-ss', options.seek.toString());
      }
      if (options.to) {
        ffmpegInputOptions.push('-to', options.to.toString());
      }
      return this.createReadStreamWithRetry({
        url: song.url,
        cacheKey: song.url,
        ffmpegInputOptions,
        cache: false,
      });
    }

    // If we need to seek, we must have a local file first.
    if (options.seek || options.to) {
      const mp3Path = await this.downloadAndCacheMP3(song);

      const ffmpegInputOptions: string[] = [];

      if (options.seek) {
        ffmpegInputOptions.push('-ss', options.seek.toString());
      }

      if (options.to) {
        ffmpegInputOptions.push('-to', options.to.toString());
      }

      // Use cached MP3 file as input
      return this.createReadStream({
        url: mp3Path,
        cacheKey: song.url,
        ffmpegInputOptions,
        cache: false, // Already cached as MP3
      });
    }

    const preloadedPath = this.preloadedStreamPaths.get(song.url);
    if (preloadedPath) {
      this.preloadedStreamPaths.delete(song.url);
      return this.createReadStream({
        url: preloadedPath,
        cacheKey: song.url,
        cache: false,
      });
    }

    // If cached, use it immediately.
    const cacheKey = `mp3:${song.url}:${AUDIO_BITRATE_KBPS}`;
    const cachedPath = await this.fileCache.getPathFor(this.getHashForCache(cacheKey));
    if (cachedPath) {
      return this.createReadStream({
        url: cachedPath,
        cacheKey: song.url,
        cache: false,
      });
    }

    // Start caching in the background and stream directly for faster start.
    this.safeAsync(this.downloadAndCacheMP3(song));
    const streamUrl = this.starchildAPI.getStreamUrl(song.url, {
      kbps: AUDIO_BITRATE_KBPS as number,
    });
    return this.createReadStreamWithRetry({
      url: streamUrl,
      cacheKey: song.url,
      cache: false,
    });
  }

  private startTrackingPosition(initialPosition?: number): void {
    // Always set position explicitly to ensure it's initialized
    // If no initial position provided, use current position (for resuming)
    if (initialPosition !== undefined) {
      this.positionInSeconds = initialPosition;
    }
    // If position is 0 and no initial position provided, ensure we start tracking from 0
    // This handles the case where we're starting a new song

    if (this.playPositionInterval) {
      clearInterval(this.playPositionInterval);
    }

    this.startPlaybackTelemetry();

    // Derive position from how much audio the resource has actually played
    // rather than counting wall-clock seconds, so a stall doesn't drift the
    // reported position past what the listener heard.
    this.positionAtStreamStart = this.positionInSeconds;
    this.playPositionInterval = setInterval(() => {
      if (this.status !== STATUS.PLAYING) {
        return;
      }

      if (!this.audioResource) {
        this.positionInSeconds++;
        return;
      }

      this.positionInSeconds = this.positionAtStreamStart + Math.floor(this.audioResource.playbackDuration / 1000);
    }, 1000);
  }

  private stopTrackingPosition(): void {
    if (this.playPositionInterval) {
      clearInterval(this.playPositionInterval);
      this.playPositionInterval = undefined;
    }

    this.stopPlaybackTelemetry();
  }

  /**
   * Samples the two numbers that distinguish a network problem from a CPU one:
   *
   * - cushion: seconds of audio ffmpeg has encoded but the player hasn't reached
   *   yet. Should climb after a track starts. Pinned near zero means the input
   *   is being read at playback speed and there is nothing to absorb jitter.
   * - lost: milliseconds of wall time in which playback did not advance, i.e.
   *   audible stutter. Non-zero while the cushion is healthy points at the
   *   event loop rather than the network.
   */
  private startPlaybackTelemetry(): void {
    this.stopPlaybackTelemetry();

    this.lastPlaybackDurationMs = this.audioResource?.playbackDuration ?? 0;
    this.lastTelemetrySampleAt = Date.now();
    this.lostPlaybackMs = 0;

    this.telemetryInterval = setInterval(() => {
      const resource = this.audioResource;
      if (!resource || this.status !== STATUS.PLAYING) {
        return;
      }

      const now = Date.now();
      const wallElapsedMs = now - this.lastTelemetrySampleAt;
      const playedMs = resource.playbackDuration - this.lastPlaybackDurationMs;
      this.lastTelemetrySampleAt = now;
      this.lastPlaybackDurationMs = resource.playbackDuration;

      // Only count a shortfall as lost audio; scheduling can also make a tick
      // arrive late, which shows up as playing more than the wall clock.
      const shortfallMs = Math.max(0, wallElapsedMs - playedMs);
      this.lostPlaybackMs += shortfallMs;

      const producedSeconds = this.activeStreamMeter && this.activeStreamByteRate > 0
        ? this.activeStreamMeter.bytes / this.activeStreamByteRate
        : null;
      const cushionSeconds = producedSeconds === null
        ? null
        : producedSeconds - (resource.playbackDuration / 1000);

      debug(`[audio] guild=${this.guildId} cushion=${cushionSeconds === null ? 'n/a' : `${cushionSeconds.toFixed(1)}s`} lost=${Math.round(this.lostPlaybackMs)}ms`);
    }, PLAYBACK_TELEMETRY_INTERVAL_MS);
  }

  private stopPlaybackTelemetry(): void {
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = undefined;
    }
  }

  /**
   * Sets the message to update with the now-playing embed
   * @param message - The Discord message to update
   */
  setNowPlayingMessage(message: Message | null): void {
    this.nowPlayingMessage = message;
  }

  /**
   * Returns the message currently rendering the now-playing embed, if any.
   */
  getNowPlayingMessage(): Message | null {
    return this.nowPlayingMessage;
  }

  getAiSuggestions(): string[] {
    return this.aiSuggestions;
  }

  /**
   * Safely executes an async operation, logging errors without throwing
   */
  private safeAsync<T>(promise: Promise<T>): void {
    promise.catch(error => {
      debug(`Unhandled error in async operation: ${formatError(error)}`);
    });
  }

  /**
   * Starts periodically updating the now-playing embed
   */
  private startEmbedUpdates(): void {
    this.stopEmbedUpdates(); // Clear any existing interval

    this.embedUpdateInterval = setInterval(() => {
      if (this.status === STATUS.PLAYING && this.nowPlayingMessage && this.getCurrent()) {
        // Use safeAsync to handle errors without throwing
        this.safeAsync((async () => {
          try {
            await this.nowPlayingMessage!.edit({
              embeds: [buildPlayingMessageEmbed(this)],
              components: buildPlaybackControls(this),
            });
          } catch (error: unknown) {
            // Message might have been deleted or bot lost permissions
            debug(`Failed to update now-playing embed: ${formatError(error)}`);
            // Clear the message reference if we can't update it
            if (this.isHttpError(error, 10008)) { // Unknown Message
              this.nowPlayingMessage = null;
              this.stopEmbedUpdates();
            }
          }
        })());
      }
    }, NOW_PLAYING_UPDATE_INTERVAL_MS);
  }

  /**
   * Stops updating the now-playing embed
   */
  private stopEmbedUpdates(): void {
    if (this.embedUpdateInterval) {
      clearInterval(this.embedUpdateInterval);
      this.embedUpdateInterval = undefined;
    }
  }

  /**
   * Sends a fresh now-playing post for the current song and deletes the previous post.
   * Falls back silently if the message cannot be sent/deleted (missing permissions, deleted message, etc.).
   */
  private async rotateNowPlayingMessage(): Promise<void> {
    const previousMessage = this.nowPlayingMessage;
    if (!previousMessage) {
      return;
    }
    const channel = previousMessage.channel;
    if (!('send' in channel) || typeof channel.send !== 'function') {
      return;
    }

    try {
      const newMessage = await channel.send({
        embeds: [buildPlayingMessageEmbed(this)],
        components: buildPlaybackControls(this),
      });
      this.nowPlayingMessage = newMessage;
    } catch (error) {
      debug(`Failed to create new now-playing message: ${formatError(error)}`);
      return;
    }

    try {
      await previousMessage.delete();
    } catch (error) {
      debug(`Failed to delete previous now-playing message: ${formatError(error)}`);
    }
  }

  private attachListeners(): void {
    if (!this.voiceConnection) {
      return;
    }

    if (this.voiceConnection.listenerCount(VoiceConnectionStatus.Disconnected) === 0) {
      this.voiceConnection.on(VoiceConnectionStatus.Disconnected, this.onVoiceConnectionDisconnect.bind(this));
    }

    if (!this.audioPlayer) {
      return;
    }

    // Remove any existing listeners before adding new ones to prevent duplicates
    // Wrap async handler to avoid Promise return type error - event listeners expect void
    this.audioPlayerIdleHandler ??= (_oldState: AudioPlayerState, newState: AudioPlayerState) => {
      void this.onAudioPlayerIdle(_oldState, newState);
    };

    const idleHandler = this.audioPlayerIdleHandler;
    this.audioPlayer.removeListener(AudioPlayerStatus.Idle, idleHandler);
    this.audioPlayer.on(AudioPlayerStatus.Idle, idleHandler);

    this.audioPlayerErrorHandler ??= (error: Error) => {
      void this.onAudioPlayerError(error);
    };

    const errorHandler = this.audioPlayerErrorHandler;
    this.audioPlayer.removeListener('error', errorHandler);
    this.audioPlayer.on('error', errorHandler);
  }

  private onVoiceConnectionDisconnect(): void {
    if (!this.allowReconnect || !this.currentChannel) {
      this.disconnect();
      return;
    }

    this.scheduleReconnect();
  }

  private async refreshAiSuggestions(song: QueuedSong): Promise<void> {
    const recommendations = await this.songbirdNext.getRecommendations({
      title: song.title,
      artist: song.artist,
    });
    this.aiSuggestions = recommendations;

    if (this.nowPlayingMessage) {
      try {
        await this.nowPlayingMessage.edit({
          embeds: [buildPlayingMessageEmbed(this)],
          components: buildPlaybackControls(this),
        });
      } catch (error) {
        debug(`Failed to update AI suggestions: ${formatError(error)}`);
      }
    }
  }

  /**
   * Decides whether this guild needs a live volume control in the audio
   * pipeline. Only ducking requires one; everything else can bake gain into
   * ffmpeg and skip the decode/re-encode round trip entirely.
   */
  private async refreshVolumeMode(settings?: Setting): Promise<void> {
    const guildSettings = settings ?? await getGuildSettings(this.guildId);
    this.useLiveVolume = guildSettings.turnDownVolumeWhenPeopleSpeak;
  }

  /**
   * Opus bitrate for the channel we are actually in.
   *
   * Voice channels run at 64 kbps unboosted and reach 384 kbps only with server
   * boosts. Encoding above the channel's rate does not raise the ceiling, it
   * just makes packets the link may not be provisioned for.
   */
  private getOpusBitrateKbps(): number {
    const channelBitrateKbps = this.currentChannel?.bitrate
      ? Math.round(this.currentChannel.bitrate / 1000)
      : OPUS_FALLBACK_BITRATE_KBPS;

    return Math.min(channelBitrateKbps, OPUS_MAX_BITRATE_KBPS);
  }

  private suppressUdpKeepAlive(oldState: unknown, newState: unknown): void {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
    const oldNetworking = Reflect.get(oldState as object, 'networking');
    const newNetworking = Reflect.get(newState as object, 'networking');

    const networkStateChangeHandler = (_: unknown, newNetworkState: unknown) => {
      const newUdp = Reflect.get(newNetworkState as Record<string, unknown>, 'udp') as {keepAliveInterval?: NodeJS.Timeout} | undefined;
      if (newUdp?.keepAliveInterval) {
        clearInterval(newUdp.keepAliveInterval);
      }
    };

    oldNetworking?.off('stateChange', networkStateChangeHandler);
    newNetworking?.on('stateChange', networkStateChangeHandler);
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
  }

  private getOrCreateAudioPlayer(): AudioPlayer {
    this.audioPlayer ??= createAudioPlayer({
      behaviors: {
        // Needs to be somewhat high for livestreams
        maxMissedFrames: AUDIO_PLAYER_MAX_MISSED_FRAMES,
      },
    });

    return this.audioPlayer;
  }

  private applyDefaultLoopMode(defaultLoopMode: number): void {
    this.loopCurrentSong = defaultLoopMode === LoopMode.Track;
    this.loopCurrentQueue = defaultLoopMode === LoopMode.Queue;
  }

  private async onAudioPlayerIdle(_oldState: AudioPlayerState, newState: AudioPlayerState): Promise<void> {
    // Automatically advance queued song at end
    if (this.loopCurrentSong && newState.status === AudioPlayerStatus.Idle && this.status === STATUS.PLAYING) {
      await this.seek(0);
      return;
    }

    // Automatically re-add current song to queue
    if (this.loopCurrentQueue && newState.status === AudioPlayerStatus.Idle && this.status === STATUS.PLAYING) {
      const currentSong = this.getCurrent();

      if (currentSong) {
        this.add(currentSong);
      } else {
        throw new Error('No song currently playing.');
      }
    }

    if (newState.status === AudioPlayerStatus.Idle && this.status === STATUS.PLAYING) {
      await this.forward(1);
      // Auto announce the next song if configured to
      const settings = await getGuildSettings(this.guildId);
      const {autoAnnounceNextSong} = settings;
      if (autoAnnounceNextSong && this.currentChannel) {
        await this.currentChannel.send({
          embeds: this.getCurrent() ? [buildPlayingMessageEmbed(this)] : [],
        });
      }
    }
  }

  private async createReadStream(options: {url: string; cacheKey: string; ffmpegInputOptions?: string[]; cache?: boolean; volumeAdjustment?: string; outputFormat?: 'opus' | 'pcm'}): Promise<Readable> {
    // Callers don't pick the format; the guild's volume mode does. Resolving it
    // here keeps every call site in getStream() consistent.
    const outputFormat = options.outputFormat ?? (this.useLiveVolume ? 'pcm' : 'opus');
    const opusBitrateKbps = this.getOpusBitrateKbps();
    const volumeAdjustment = options.volumeAdjustment
      ?? (outputFormat === 'opus' && this.getVolume() !== VOLUME_MAX
        ? (this.getVolume() / VOLUME_MAX).toString()
        : undefined);

    return new Promise((resolve, reject) => {
      const capacitor = new WriteStream();

      if (options?.cache) {
        const { stream: cacheStream } = this.fileCache.createWriteStream(this.getHashForCache(options.cacheKey));
        capacitor.createReadStream().pipe(cacheStream as unknown as NodeJS.WritableStream);
      }

      const returnedStream = capacitor.createReadStream();
      let hasReturnedStreamClosed = false;
      let hasResolved = false;

      // Determine if input is a file path or URL
      const isFile = !options.url.startsWith('http://') && !options.url.startsWith('https://');

      // Network inputs burst a cushion, then settle to a rate that keeps
      // rebuilding it. Reading at exactly 1x (-re) leaves nothing buffered, so
      // any jitter becomes an underrun. Local files are already instant.
      const readAhead = isFile
        ? []
        : ['-readrate', STREAM_READ_RATE.toString(), '-readrate_initial_burst', STREAM_READ_BURST_SECONDS.toString()];

      // Concatenate rather than replace: seeking passes -ss, which previously
      // discarded the pacing flags entirely and made seek behave differently
      // from normal playback.
      const inputOptions = [...readAhead, ...(options?.ffmpegInputOptions ?? [])];

      // Gain is baked in here on the passthrough path, since there is no volume
      // transformer downstream to apply it. A filter is only added when there is
      // actually an adjustment to make.
      const volumeFilter = volumeAdjustment === undefined
        ? []
        : ['-filter:a', `volume=${volumeAdjustment}`];

      const outputOptions = outputFormat === 'pcm'
        ? [
          '-vn',
          '-f', 's16le',
          '-ar', DISCORD_SAMPLE_RATE_HZ.toString(),
          '-ac', DISCORD_CHANNEL_COUNT.toString(),
          ...volumeFilter,
        ]
        : [
          '-vn',
          '-c:a', 'libopus',
          '-b:a', `${opusBitrateKbps}k`,
          '-ar', DISCORD_SAMPLE_RATE_HZ.toString(),
          '-ac', DISCORD_CHANNEL_COUNT.toString(),
          // Our packets are what listeners receive on the passthrough path, so
          // in-band FEC lets their clients rebuild ones that go missing.
          '-packet_loss', OPUS_EXPECTED_PACKET_LOSS_PERCENT.toString(),
          '-fec', '1',
          '-f', 'webm',
          ...volumeFilter,
        ];

      const ff = new FFmpeggy({
        input: options.url,
        inputOptions,
        pipe: true,
        outputOptions,
        overwriteExisting: true,
      });
      // Measure how much audio ffmpeg has produced, so telemetry can report the
      // cushion between the encoder and the player.
      const meter = new ByteCounter();
      this.activeStreamMeter = meter;
      this.activeStreamByteRate = outputFormat === 'pcm'
        ? PCM_BYTES_PER_SECOND
        : (opusBitrateKbps * 1000) / 8;
      ff.toStream().pipe(meter).pipe(capacitor as unknown as NodeJS.WritableStream);

      ff
        .on('error', (error: Error) => {
          if (!hasReturnedStreamClosed && !hasResolved) {
            hasResolved = true;
            clearTimeout(startTimeout);
            reject(error);
          } else {
            debug(`ffmpeg stream error after start: ${error.message}`);
          }
        })
        .on('start', (args: readonly string[]) => {
          debug(`Spawned ffmpeg with ${args.join(' ')}`);
          if (!hasResolved) {
            hasResolved = true;
            clearTimeout(startTimeout);
            resolve(returnedStream);
          }
        });

      const startTimeout = setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          void ff.stop();
          reject(new Error('ffmpeg start timeout'));
        }
      }, FFMPEG_START_TIMEOUT_MS);

      void ff.run().catch((error: unknown) => {
        if (hasResolved) {
          return;
        }

        hasResolved = true;
        clearTimeout(startTimeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      });

      returnedStream.on('close', () => {
        if (!options.cache) {
          void ff.stop();
        }

        hasReturnedStreamClosed = true;
        clearTimeout(startTimeout);
      });
    });
  }

  private createAudioStream(stream: Readable) {
    // Asking for Opus input *and* a volume control forces the library to insert
    // a decoder, a volume transformer and an encoder - the stream is torn down
    // to samples and rebuilt for no benefit. Only take that cost where live
    // gain is actually needed; otherwise hand Discord the packets as they are.
    if (this.useLiveVolume) {
      return createAudioResource(stream, {
        inputType: StreamType.Raw,
        inlineVolume: true,
      });
    }

    return createAudioResource(stream, {
      inputType: StreamType.WebmOpus,
      inlineVolume: false,
    });
  }

  private playAudioPlayerResource(resource: AudioResource) {
    if (this.audioPlayer !== null) {
      this.audioResource = resource;
      this.setAudioPlayerVolume();
      this.audioPlayer.play(this.audioResource);
    }
  }

  private setAudioPlayerVolume(level?: number) {
    // Audio resource expects a float between 0 and 1 to represent level percentage
    const volumeLevel = level ?? this.getVolume();
    this.audioResource?.volume?.setVolume(volumeLevel / VOLUME_MAX);
  }

  /**
   * Type guard to check if an error is an HTTP error with a specific status code
   * @param error - The error to check
   * @param statusCode - The HTTP status code to check for
   * @returns True if the error has the specified status code
   */
  private isHttpError(error: unknown, statusCode: number): error is {statusCode: number} {
    return typeof error === 'object' && error !== null && 'statusCode' in error && (error as {statusCode: number}).statusCode === statusCode;
  }

  private prefetchNextSong(): void {
    const nextSong = this.queue[this.queuePosition + 1];
    if (!nextSong || nextSong.isLive || nextSong.source !== MediaSource.Starchild) {
      // Only Starchild tracks can be fetched as a file ahead of time. Others
      // (YouTube, HLS, attachments) are streamed straight from their origin, so
      // there is nothing to warm - they rely on the read-ahead burst instead.
      return;
    }

    this.safeAsync((async () => {
      const path = await this.downloadAndCacheMP3(nextSong);
      this.preloadedStreamPaths.set(nextSong.url, path);
    })());
  }

  private async onAudioPlayerError(error: Error): Promise<void> {
    debug(`Audio player error: ${error.message}`);
    if (this.status !== STATUS.PLAYING) {
      return;
    }

    const currentSong = this.getCurrent();
    if (!currentSong) {
      return;
    }

    if (this.playbackErrorAttempts >= PLAYBACK_ERROR_MAX_RETRIES) {
      debug('Audio player error retries exhausted, skipping track.');
      await this.forward(1);
      return;
    }

    const delayMs = PLAYBACK_ERROR_BACKOFF_BASE_MS * 2 ** this.playbackErrorAttempts;
    this.playbackErrorAttempts++;
    await this.delay(delayMs);

    if (currentSong.isLive) {
      await this.play();
    } else {
      await this.seek(this.positionInSeconds);
    }
  }

  private async createReadStreamWithRetry(options: {url: string; cacheKey: string; ffmpegInputOptions?: string[]; cache?: boolean; volumeAdjustment?: string; outputFormat?: 'opus' | 'pcm'}): Promise<Readable> {
    const maxRetries = STREAM_CREATE_MAX_RETRIES;
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= maxRetries) {
      try {
        return await this.createReadStream(options);
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) {
          break;
        }
        const delayMs = STREAM_CREATE_BACKOFF_BASE_MS * 2 ** attempt;
        await this.delay(delayMs);
        attempt++;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async delay(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.currentChannel) {
      return;
    }

    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      debug('Reconnect attempts exhausted, disconnecting.');
      this.disconnect();
      return;
    }

    const delayMs = Math.min(RECONNECT_BACKOFF_BASE_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_DELAY_MS);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.safeAsync(this.attemptReconnect());
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (!this.currentChannel) {
      return;
    }

    try {
      this.voiceConnection?.destroy();
      this.voiceConnection = null;
      await this.connect(this.currentChannel);

      if (this.status === STATUS.PLAYING) {
        const currentSong = this.getCurrent();
        if (currentSong) {
          if (currentSong.isLive) {
            await this.play();
          } else {
            await this.seek(this.positionInSeconds);
          }
        }
      }
    } catch (error) {
      debug(`Reconnect attempt failed: ${formatError(error)}`);
      this.scheduleReconnect();
    }
  }
}
