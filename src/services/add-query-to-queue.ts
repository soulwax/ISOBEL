// File: src/services/add-query-to-queue.ts

import shuffle from 'array-shuffle';
import { type Attachment, type ChatInputCommandInteraction, type GuildMember, MessageFlags, type ModalSubmitInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { inject, injectable } from 'inversify';
import { SponsorBlock } from 'sponsorblock-api';
import type PlayerManager from '../managers/player.js';
import type GetSongs from '../services/get-songs.js';
import { TYPES } from '../types.js';
import { buildPlaybackControls, buildPlayingMessageEmbed } from '../utils/build-embed.js';
import { getMemberVoiceChannel, getMostPopularVoiceChannel } from '../utils/channels.js';
import { ONE_HOUR_IN_SECONDS } from '../utils/constants.js';
import debug from '../utils/debug.js';
import { getGuildSettings } from '../utils/get-guild-settings.js';
import type Config from './config.js';
import type KeyValueCacheProvider from './key-value-cache.js';
import { MediaSource, STATUS, type SongMetadata } from './player.js';

@injectable()
export default class AddQueryToQueue {
  private readonly sponsorBlock?: SponsorBlock;
  private sponsorBlockDisabledUntil?: Date;
  private readonly sponsorBlockTimeoutDelay;

  constructor(@inject(TYPES.Services.GetSongs) private readonly getSongs: GetSongs,
    @inject(TYPES.Managers.Player) private readonly playerManager: PlayerManager,
    @inject(TYPES.Config) private readonly config: Config,
    @inject(TYPES.KeyValueCache) private readonly cache: KeyValueCacheProvider) {
    this.sponsorBlockTimeoutDelay = config.SPONSORBLOCK_TIMEOUT;
    this.sponsorBlock = config.ENABLE_SPONSORBLOCK
      ? new SponsorBlock('echo-sb-integration') // UserID matters only for submissions
      : undefined;
  }

  public async addToQueue({
    query,
    attachment,
    songsOverride,
    extraMsgOverride,
    addToFrontOfQueue,
    shuffleAdditions,
    shouldSplitChapters,
    skipCurrentTrack,
    interaction,
  }: {
    query?: string | null;
    attachment?: Attachment | null;
    songsOverride?: SongMetadata[];
    extraMsgOverride?: string;
    addToFrontOfQueue: boolean;
    shuffleAdditions: boolean;
    shouldSplitChapters: boolean;
    skipCurrentTrack: boolean;
    interaction: ChatInputCommandInteraction | ModalSubmitInteraction | StringSelectMenuInteraction;
  }): Promise<void> {
    // Note: shouldSplitChapters is currently not implemented
    // This parameter is accepted for API compatibility but has no effect
    void shouldSplitChapters;
    if (!interaction.guild) {
      throw new Error('Command must be used in a guild');
    }

    if (!interaction.member) {
      throw new Error('Member information not available');
    }

    const guildId = interaction.guild.id;
    const player = this.playerManager.get(guildId);
    const wasPlayingSong = player.getCurrent() !== null;

    const memberChannel = getMemberVoiceChannel(interaction.member as GuildMember);
    const voiceChannels = memberChannel ?? getMostPopularVoiceChannel(interaction.guild);
    // voiceChannels is always a tuple [VoiceChannel, number] after nullish coalescing
    // getMostPopularVoiceChannel always returns a tuple (or throws if no channels exist)
    const targetVoiceChannel = voiceChannels[0];

    const settings = await getGuildSettings(guildId);

    const { queueAddResponseEphemeral } = settings;

    await interaction.deferReply({ flags: queueAddResponseEphemeral ? MessageFlags.Ephemeral : undefined });

    // For play command, only add one song regardless of playlist limit
    let newSongs: SongMetadata[] = [];
    let extraMsg = '';

    if (songsOverride && songsOverride.length > 0) {
      newSongs = songsOverride;
      extraMsg = extraMsgOverride ?? '';
    } else if (attachment) {
      const attachmentName = attachment.name ?? 'attachment.mp3';
      const isMp3 = (attachment.contentType?.toLowerCase()?.includes('audio/mpeg') ?? false)
        || attachmentName.toLowerCase().endsWith('.mp3');

      if (!isMp3) {
        throw new Error('only mp3 attachments are supported');
      }

      newSongs = [{
        url: attachment.url,
        source: MediaSource.DiscordAttachment,
        isLive: false,
        title: attachmentName,
        artist: 'Discord attachment',
        length: 0,
        offset: 0,
        playlist: null,
        thumbnailUrl: null,
      }];
      extraMsg = 'from attachment';
    } else {
      if (!query) {
        throw new Error('provide a search query or attach an mp3');
      }
      [newSongs, extraMsg] = await this.getSongs.getSongs(query, 1);
    }

    if (newSongs.length === 0) {
      throw new Error('no songs found');
    }

    if (shuffleAdditions && newSongs.length > 1) {
      newSongs = shuffle(newSongs);
    }

    if (this.config.ENABLE_SPONSORBLOCK && !attachment) {
      newSongs = await Promise.all(newSongs.map(this.skipNonMusicSegments.bind(this)));
    }

    if (!interaction.channel) {
      throw new Error('Channel information not available');
    }

    newSongs.forEach(song => {
      player.add({
        ...song,
        addedInChannelId: interaction.channel!.id,
        requestedBy: (interaction.member as GuildMember).user.id,
      }, { immediate: addToFrontOfQueue ?? false });
    });

    const firstSong = newSongs[0];
    const firstSongDisplay = `${firstSong.title} - ${firstSong.artist}`;

    let statusMsg = '';
    let showedEmbed = false;

    if (player.voiceConnection === null) {
      await player.connect(targetVoiceChannel);

      // Resume / start playback
      await player.play();

      if (wasPlayingSong) {
        statusMsg = 'resuming playback';
      }

      const message = await interaction.editReply({
        embeds: [buildPlayingMessageEmbed(player)],
        components: buildPlaybackControls(player),
      });

      // Set the message for animated progress bar updates
      if (message) {
        player.setNowPlayingMessage(message);
        showedEmbed = true;
      }
    } else if (player.status === STATUS.IDLE) {
      // Player is idle, start playback instead
      await player.play();
    }

    if (skipCurrentTrack) {
      // Only skip if there are more songs in the queue
      if (player.canGoForward(1)) {
        await player.forward(1);
      } else {
        throw new Error('no song to skip to');
      }
    }

    // Build response message
    if (statusMsg !== '') {
      if (extraMsg === '') {
        extraMsg = statusMsg;
      } else {
        extraMsg = `${statusMsg}, ${extraMsg}`;
      }
    }

    if (extraMsg !== '') {
      extraMsg = ` (${extraMsg})`;
    }

    // Only update message if we didn't already show the embed
    // If we showed the embed, keep it animated; otherwise show the text response
    if (!showedEmbed) {
      await interaction.editReply(
        newSongs.length === 1
          ? `**${firstSongDisplay}** added to the${addToFrontOfQueue ? ' front of the' : ''} queue${skipCurrentTrack ? ' and current track skipped' : ''}${extraMsg}`
          : `**${firstSongDisplay}** and ${newSongs.length - 1} other songs were added to the queue${skipCurrentTrack ? ' and current track skipped' : ''}${extraMsg}`
      );
    }
  }

  private async skipNonMusicSegments(song: SongMetadata) {
    if (!this.sponsorBlock
      || (this.sponsorBlockDisabledUntil && new Date() < this.sponsorBlockDisabledUntil)
      || song.source !== MediaSource.Starchild
      || !song.url) {
      return song;
    }

    try {
      const segments = await this.cache.wrap(
        async () => this.sponsorBlock?.getSegments(song.url, ['music_offtopic']),
        {
          key: song.url, // Value is too short for hashing
          expiresIn: ONE_HOUR_IN_SECONDS,
        },
      ) ?? [];
      const skipSegments = segments
        .sort((a, b) => a.startTime - b.startTime)
        .reduce((acc: { startTime: number; endTime: number }[], { startTime, endTime }) => {
          const previousSegment = acc[acc.length - 1];
          // If segments overlap merge
          if (previousSegment && previousSegment.endTime > startTime) {
            acc[acc.length - 1].endTime = endTime;
          } else {
            acc.push({ startTime, endTime });
          }

          return acc;
        }, []);

      const intro = skipSegments[0];
      const outro = skipSegments.at(-1);
      if (outro && outro?.endTime >= song.length - 2) {
        song.length -= outro.endTime - outro.startTime;
      }

      if (intro?.startTime <= 2) {
        song.offset = Math.floor(intro.endTime);
        song.length -= song.offset;
      }

      return song;
    } catch (e) {
      if (!(e instanceof Error)) {
        debug(`Unexpected event occurred while fetching skip segments: ${String(e)}`);
        return song;
      }

      if (!e.message.includes('404')) {
        // Don't log 404 response, it just means that there are no segments for given video
        debug(`Could not fetch skip segments for "${song.url}": ${e.message}`);
      }

      if (e.message.includes('504')) {
        // Stop fetching SponsorBlock data when servers are down
        this.sponsorBlockDisabledUntil = new Date(new Date().getTime() + (this.sponsorBlockTimeoutDelay * 60_000));
      }

      return song;
    }
  }
}
