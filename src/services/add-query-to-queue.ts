// File: src/services/add-query-to-queue.ts

import shuffle from 'array-shuffle';
import { type Attachment, type ChatInputCommandInteraction, type GuildMember, MessageFlags, type ModalSubmitInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { inject, injectable } from 'inversify';
import type PlayerManager from '../managers/player.js';
import type GetSongs from '../services/get-songs.js';
import { TYPES } from '../types.js';
import { buildPlaybackControls, buildPlayingMessageEmbed } from '../utils/build-embed.js';
import { getMemberVoiceChannel, getMostPopularVoiceChannel } from '../utils/channels.js';
import { getGuildSettings } from '../utils/get-guild-settings.js';
import { MediaSource, STATUS, type SongMetadata } from './player.js';

@injectable()
export default class AddQueryToQueue {
  constructor(@inject(TYPES.Services.GetSongs) private readonly getSongs: GetSongs,
    @inject(TYPES.Managers.Player) private readonly playerManager: PlayerManager) {}

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

    const { maxQueueSize, queueAddResponseEphemeral } = settings;

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

    const originalSongCount = newSongs.length;
    if (maxQueueSize > 0) {
      const remainingQueueSlots = maxQueueSize - player.getActiveQueueSize();

      if (remainingQueueSlots <= 0) {
        throw new Error(`queue limit reached (${maxQueueSize} tracks)`);
      }

      if (newSongs.length > remainingQueueSlots) {
        newSongs = newSongs.slice(0, remainingQueueSlots);
        extraMsg = extraMsg === ''
          ? `queue limit: added ${newSongs.length} of ${originalSongCount}`
          : `${extraMsg}, queue limit: added ${newSongs.length} of ${originalSongCount}`;
      }
    }

    if (shuffleAdditions && newSongs.length > 1) {
      newSongs = shuffle(newSongs);
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
}
