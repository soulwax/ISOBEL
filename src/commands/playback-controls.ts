// File: src/commands/playback-controls.ts

import { SlashCommandBuilder } from '@discordjs/builders';
import { ActionRowBuilder, type ButtonInteraction, type ChatInputCommandInteraction, type GuildMember, MessageFlags, ModalBuilder, type ModalSubmitInteraction, type StringSelectMenuInteraction, TextInputBuilder, TextInputStyle } from 'discord.js';
import { inject, injectable } from 'inversify';
import { URL } from 'node:url';
import type PlayerManager from '../managers/player.js';
import type AddQueryToQueue from '../services/add-query-to-queue.js';
import { MediaSource, STATUS, type SongMetadata } from '../services/player.js';
import { TYPES } from '../types.js';
import { buildPlaybackControls, buildPlayingMessageEmbed } from '../utils/build-embed.js';
import { getMemberVoiceChannel } from '../utils/channels.js';
import errorMsg from '../utils/error-msg.js';
import type Command from './index.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('playback-controls')
    .setDescription('internal playback controls');

  public readonly handledButtonIds = ['playback:toggle', 'playback:prev', 'playback:next', 'playback:search', 'playback:stop', 'playback:seek', 'playback:suggest'] as const;

  private readonly playerManager: PlayerManager;
  private readonly addQueryToQueue: AddQueryToQueue;

  constructor(
    @inject(TYPES.Managers.Player) playerManager: PlayerManager,
    @inject(TYPES.Services.AddQueryToQueue) addQueryToQueue: AddQueryToQueue
  ) {
    this.playerManager = playerManager;
    this.addQueryToQueue = addQueryToQueue;
  }

  public async execute(_interaction: ChatInputCommandInteraction): Promise<void> {
    // This command exists only for button handling.
  }

  public async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guild || !interaction.member) {
      return;
    }

    if (!getMemberVoiceChannel(interaction.member as GuildMember)) {
      await interaction.reply({content: errorMsg('You must be in a voice channel'), flags: MessageFlags.Ephemeral});
      return;
    }

    const player = this.playerManager.get(interaction.guild.id);

    switch (interaction.customId) {
      case 'playback:toggle':
        if (player.status === STATUS.PLAYING) {
          player.pause();
        } else {
          await player.play();
        }
        break;
      case 'playback:prev':
        if (player.canGoBack()) {
          await player.back();
        } else {
          await interaction.reply({content: errorMsg('No previous song in queue'), flags: MessageFlags.Ephemeral});
          return;
        }
        break;
      case 'playback:next':
        if (player.canGoForward(1)) {
          await player.forward(1);
        } else {
          await interaction.reply({content: errorMsg('No next song in queue'), flags: MessageFlags.Ephemeral});
          return;
        }
        break;
      case 'playback:search': {
        const modal = new ModalBuilder()
          .setCustomId('playback:search')
          .setTitle('Search');

        const input = new TextInputBuilder()
          .setCustomId('search_input')
          .setLabel('Search term or MP3 URL')
          .setPlaceholder('song name, URL, or Discord attachment URL')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(input)
        );

        await interaction.showModal(modal);
        return;
      }
      case 'playback:stop':
        player.stop();
        break;
      case 'playback:seek': {
        const modal = new ModalBuilder()
          .setCustomId('playback:seek')
          .setTitle('Seek');

        const input = new TextInputBuilder()
          .setCustomId('seek_input')
          .setLabel('Position (seconds or 1m23s)')
          .setPlaceholder('e.g. 90 or 1m30s')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(input)
        );

        await interaction.showModal(modal);
        return;
      }
      default:
        return;
    }

    try {
      const currentSong = player.getCurrent();
      if (currentSong) {
        player.setNowPlayingMessage(interaction.message);
        await interaction.update({
          embeds: [buildPlayingMessageEmbed(player)],
          components: buildPlaybackControls(player),
        });
      } else {
        player.setNowPlayingMessage(null);
        await interaction.update({
          content: 'Playback stopped.',
          embeds: [],
          components: [],
        });
      }
    } catch {
      // If message was deleted or can't be updated, fall back to ack.
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
      }
    }
  }

  public async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.guild || !interaction.member) {
      return;
    }

    if (interaction.customId === 'playback:seek') {
      if (!getMemberVoiceChannel(interaction.member as GuildMember)) {
        await interaction.reply({content: errorMsg('You must be in a voice channel'), flags: MessageFlags.Ephemeral});
        return;
      }

      const raw = interaction.fields.getTextInputValue('seek_input').trim();
      const seconds = this.parseSeekInput(raw);
      if (seconds === null) {
        await interaction.reply({content: errorMsg('Invalid seek format'), flags: MessageFlags.Ephemeral});
        return;
      }

      const player = this.playerManager.get(interaction.guild.id);
      await player.seek(seconds);

      await interaction.reply({content: '⏩ Seeked', flags: MessageFlags.Ephemeral});
      return;
    }

    if (interaction.customId !== 'playback:search') {
      return;
    }

    if (!getMemberVoiceChannel(interaction.member as GuildMember)) {
      await interaction.reply({content: errorMsg('You must be in a voice channel'), flags: MessageFlags.Ephemeral});
      return;
    }

    const raw = interaction.fields.getTextInputValue('search_input').trim();
    if (!raw) {
      await interaction.reply({content: errorMsg('Provide a search term or mp3 URL'), flags: MessageFlags.Ephemeral});
      return;
    }

    const mp3Song = this.tryBuildMp3Song(raw);
    if (mp3Song) {
      if (!interaction.channelId) {
        await interaction.reply({content: errorMsg('Channel information not available'), flags: MessageFlags.Ephemeral});
        return;
      }
      const player = this.playerManager.get(interaction.guild.id);
      player.add({
        ...mp3Song,
        addedInChannelId: interaction.channelId,
        requestedBy: interaction.user.id,
      }, {immediate: false});
      if (player.status === STATUS.IDLE) {
        await player.play();
      }
      await interaction.reply({content: `**${mp3Song.title}** added from MP3 URL`, flags: MessageFlags.Ephemeral});
      return;
    }

    await this.addQueryToQueue.addToQueue({
      interaction,
      query: raw,
      addToFrontOfQueue: false,
      shuffleAdditions: false,
      shouldSplitChapters: false,
      skipCurrentTrack: false,
    });
  }

  public async handleSelectMenuInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.guild || !interaction.member) {
      return;
    }

    if (interaction.customId !== 'playback:suggest') {
      return;
    }

    if (!getMemberVoiceChannel(interaction.member as GuildMember)) {
      await interaction.reply({content: errorMsg('You must be in a voice channel'), flags: MessageFlags.Ephemeral});
      return;
    }

    const [value] = interaction.values;
    if (!value) {
      await interaction.reply({content: errorMsg('No suggestion selected'), flags: MessageFlags.Ephemeral});
      return;
    }

    await this.addQueryToQueue.addToQueue({
      interaction,
      query: value,
      addToFrontOfQueue: false,
      shuffleAdditions: false,
      shouldSplitChapters: false,
      skipCurrentTrack: false,
    });
  }

  private parseSeekInput(value: string): number | null {
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }

    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value);
    if (!match) {
      return null;
    }

    const hours = match[1] ? parseInt(match[1], 10) : 0;
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const seconds = match[3] ? parseInt(match[3], 10) : 0;
    const total = hours * 3600 + minutes * 60 + seconds;
    return total > 0 ? total : null;
  }

  private tryBuildMp3Song(value: string): SongMetadata | null {
    try {
      const url = new URL(value);
      const pathname = url.pathname.toLowerCase();
      if (!pathname.endsWith('.mp3')) {
        return null;
      }
      const title = decodeURIComponent(pathname.split('/').pop() ?? 'attachment.mp3');
      return {
        url: url.toString(),
        source: MediaSource.DiscordAttachment,
        isLive: false,
        title,
        artist: 'MP3 URL',
        length: 0,
        offset: 0,
        playlist: null,
        thumbnailUrl: null,
      };
    } catch {
      return null;
    }
  }
}
