// File: src/services/playback-history.ts

import { type Interaction } from 'discord.js';
import { injectable } from 'inversify';
import { prisma } from '../utils/db.js';
import debug from '../utils/debug.js';
// Type-only on purpose: a value import from player.ts closes a module cycle
// through the DI container.
import type { QueuedSong } from './player.js';

/** Someone who caused a playback change, captured at the moment they did it. */
export interface PlaybackActor {
  id: string;
  name: string;
}

export type PlayEndReason = 'finished' | 'skipped' | 'back' | 'stopped' | 'error' | 'disconnected';

export type PlaybackActionKind = 'queue' | 'queue-next' | 'skip' | 'back' | 'stop';

export interface PlayContext {
  guildId: string;
  guildName: string | null;
  voiceChannelId: string | null;
}

export interface PlayStart {
  song: QueuedSong;
  /** Readable MediaSource name, e.g. "Starchild" or "HLS". */
  sourceName: string;
}

export function actorFromInteraction(interaction: Interaction): PlaybackActor {
  return {id: interaction.user.id, name: interaction.user.displayName};
}

/**
 * Records what played where, and who skipped, went back, stopped or queued
 * what. The web dashboard's superuser admin view reads these tables.
 *
 * Every write is fire-and-forget and swallows its own errors: history is an
 * audit trail, and a slow or missing table (e.g. `pnpm dev`, which doesn't
 * migrate) must never stall or break playback.
 */
@injectable()
export default class PlaybackHistory {
  /** Resolves to the new SongPlay id, or null if the insert failed. */
  async startPlay(context: PlayContext, {song, sourceName}: PlayStart): Promise<number | null> {
    try {
      const row = await prisma.songPlay.create({
        data: {
          guildId: context.guildId,
          guildName: context.guildName,
          voiceChannelId: context.voiceChannelId,
          textChannelId: song.addedInChannelId ?? null,
          title: song.title,
          artist: song.artist,
          album: song.album ?? null,
          url: song.url,
          source: sourceName,
          lengthSeconds: Math.max(0, Math.round(song.length)),
          isLive: song.isLive,
          playlistTitle: song.playlist?.title ?? null,
          requestedBy: song.requestedBy,
          requestedByName: song.requestedByName ?? null,
        },
        select: {id: true},
      });
      return row.id;
    } catch (error: unknown) {
      debug('Playback history: failed to record play start', error);
      return null;
    }
  }

  finishPlay(playId: Promise<number | null>, end: {
    endedAt: Date;
    playedSeconds: number;
    reason: PlayEndReason;
    actor?: PlaybackActor;
  }): void {
    void playId.then(async (id) => {
      if (id === null) {
        return;
      }

      await prisma.songPlay.update({
        where: {id},
        data: {
          endedAt: end.endedAt,
          playedSeconds: Math.max(0, Math.round(end.playedSeconds)),
          endReason: end.reason,
          endedBy: end.actor?.id ?? null,
          endedByName: end.actor?.name ?? null,
        },
      });
    }).catch((error: unknown) => {
      debug('Playback history: failed to record play end', error);
    });
  }

  recordAction(context: Omit<PlayContext, 'voiceChannelId'>, action: {
    kind: PlaybackActionKind;
    actor: PlaybackActor;
    song?: {title: string; artist: string} | null;
    /** The play this action ended, for skip / back / stop. */
    playId?: Promise<number | null> | null;
    detail?: string | null;
  }): void {
    void (async () => {
      const songPlayId = action.playId ? await action.playId : null;

      await prisma.playbackAction.create({
        data: {
          guildId: context.guildId,
          guildName: context.guildName,
          userId: action.actor.id,
          userName: action.actor.name,
          action: action.kind,
          songTitle: action.song?.title ?? null,
          songArtist: action.song?.artist ?? null,
          songPlayId,
          detail: action.detail ?? null,
        },
      });
    })().catch((error: unknown) => {
      debug('Playback history: failed to record action', error);
    });
  }
}
