// File: src/commands/playback-controls.ts

import { SlashCommandBuilder } from '@discordjs/builders';
import { ActionRowBuilder, type ButtonInteraction, type ChatInputCommandInteraction, type GuildMember, MessageFlags, ModalBuilder, type ModalSubmitInteraction, type StringSelectMenuInteraction, TextInputBuilder, TextInputStyle } from 'discord.js';
import { inject, injectable } from 'inversify';
import { URL } from 'node:url';
import type PlayerManager from '../managers/player.js';
import type AddQueryToQueue from '../services/add-query-to-queue.js';
import type Player from '../services/player.js';
import { MediaSource, STATUS, type SongMetadata } from '../services/player.js';
import { TYPES } from '../types.js';
import { buildPlaybackControls, buildPlayingMessageEmbed, buildQueueEmbed } from '../utils/build-embed.js';
import { getMemberVoiceChannel } from '../utils/channels.js';
import { QUEUE_PAGE_SIZE_DEFAULT, SEEK_STEP_SECONDS, VOLUME_MAX, VOLUME_MIN, VOLUME_STEP } from '../utils/constants.js';
import errorMsg, { formatError } from '../utils/error-msg.js';
import type Command from './index.js';

type PlaybackComponentInteraction = ButtonInteraction | StringSelectMenuInteraction;

@injectable()
export default class PlaybackControls implements Command {
  private static readonly aiSuggestionValuePrefix = 'ai-suggest:';

  public readonly slashCommand = new SlashCommandBuilder()
    .setName('playback-controls')
    .setDescription('internal playback controls');

  public readonly handledButtonIds = [
    // Row 1: transport
    'playback:prev',
    'playback:rewind',
    'playback:toggle',
    'playback:fastforward',
    'playback:next',
    // Row 2: mix
    'playback:loop',
    'playback:shuffle',
    'playback:volume-down',
    'playback:volume-up',
    'playback:stop',
    // Row 3: secondary actions
    'playback:actions',
    // Keep the prior button and modal IDs registered so existing messages keep
    // working until Discord replaces them with the redesigned controls.
    'playback:search',
    'playback:queue',
    'playback:seek',
    'playback:suggest',
  ] as const;

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

    const player = this.playerManager.get(interaction.guild.id);

    // Peeking at the queue changes nothing, so it doesn't require being in the voice channel.
    if (interaction.customId === 'playback:queue') {
      await this.showQueue(interaction, player);
      return;
    }

    if (!getMemberVoiceChannel(interaction.member as GuildMember)) {
      await interaction.reply({content: errorMsg('You must be in a voice channel'), flags: MessageFlags.Ephemeral});
      return;
    }

    switch (interaction.customId) {
      case 'playback:toggle':
        if (player.status === STATUS.PLAYING) {
          player.pause();
        } else {
          // Resuming can rebuild the stream, which takes longer than the 3s ack window.
          await interaction.deferUpdate();
          await this.runPlayerAction(interaction, () => player.play());
        }

        break;
      case 'playback:prev':
        if (!player.canGoBack()) {
          await interaction.reply({content: errorMsg('No previous song in queue'), flags: MessageFlags.Ephemeral});
          return;
        }

        await interaction.deferUpdate();
        await this.runPlayerAction(interaction, () => player.back());
        break;
      case 'playback:next':
        if (!player.canGoForward(1)) {
          await interaction.reply({content: errorMsg('No next song in queue'), flags: MessageFlags.Ephemeral});
          return;
        }

        await interaction.deferUpdate();
        await this.runPlayerAction(interaction, () => player.forward(1));
        break;
      case 'playback:rewind':
      case 'playback:fastforward': {
        const step = interaction.customId === 'playback:rewind' ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS;
        const target = this.getSeekTarget(player, step);

        if (target === null) {
          await interaction.reply({content: errorMsg('This track can\'t be seeked'), flags: MessageFlags.Ephemeral});
          return;
        }

        await interaction.deferUpdate();
        await this.runPlayerAction(interaction, () => player.seek(target));
        break;
      }

      case 'playback:loop':
        if (!player.getCurrent()) {
          await interaction.reply({content: errorMsg('Nothing is playing'), flags: MessageFlags.Ephemeral});
          return;
        }

        this.cycleLoopMode(player);
        break;
      case 'playback:shuffle':
        if (player.queueSize() < 2) {
          await interaction.reply({content: errorMsg('Not enough songs queued to shuffle'), flags: MessageFlags.Ephemeral});
          return;
        }

        player.shuffle();
        break;
      case 'playback:volume-down':
      case 'playback:volume-up': {
        const step = interaction.customId === 'playback:volume-up' ? VOLUME_STEP : -VOLUME_STEP;
        const volume = Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, player.getVolume() + step));

        player.setVolume(volume);
        break;
      }

      case 'playback:search': {
        await this.showSearchModal(interaction);
        return;
      }

      case 'playback:stop':
        player.stop();
        break;
      case 'playback:seek': {
        await this.showSeekModal(interaction);
        return;
      }

      default:
        return;
    }

    await this.refreshNowPlaying(interaction, player);
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

    if (interaction.customId === 'playback:actions') {
      await this.handleSecondaryAction(interaction);
      return;
    }

    if (interaction.customId !== 'playback:suggest') {
      return;
    }

    if (!getMemberVoiceChannel(interaction.member as GuildMember)) {
      await interaction.reply({content: errorMsg('You must be in a voice channel'), flags: MessageFlags.Ephemeral});
      return;
    }

    const [selectedValue] = interaction.values;
    if (!selectedValue) {
      await interaction.reply({content: errorMsg('No suggestion selected'), flags: MessageFlags.Ephemeral});
      return;
    }

    const player = this.playerManager.get(interaction.guild.id);
    let query = selectedValue;
    if (selectedValue.startsWith(PlaybackControls.aiSuggestionValuePrefix)) {
      const index = Number.parseInt(selectedValue.slice(PlaybackControls.aiSuggestionValuePrefix.length), 10);
      const suggestion = player.getAiSuggestions()[index];
      if (!suggestion) {
        await interaction.reply({content: errorMsg('Suggestion is no longer available'), flags: MessageFlags.Ephemeral});
        return;
      }
      query = suggestion;
    }

    await this.addQueryToQueue.addToQueue({
      interaction,
      query,
      addToFrontOfQueue: false,
      shuffleAdditions: false,
      shouldSplitChapters: false,
      skipCurrentTrack: false,
    });
  }

  /**
   * Re-renders the now-playing message the pressed button belongs to.
   */
  private async refreshNowPlaying(interaction: ButtonInteraction, player: Player): Promise<void> {
    const activeMessage = player.getNowPlayingMessage();

    // Starting a new track posts a fresh now-playing message, so only claim the
    // pressed message when the player isn't already animating a different one.
    const ownsMessage = !activeMessage || activeMessage.id === interaction.message.id;

    try {
      if (player.getCurrent()) {
        if (ownsMessage) {
          player.setNowPlayingMessage(interaction.message);
        }

        const payload = {
          content: null,
          embeds: [buildPlayingMessageEmbed(player)],
          components: buildPlaybackControls(player),
        };

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(payload);
        } else {
          await interaction.update(payload);
        }
      } else {
        player.setNowPlayingMessage(null);
        const payload = {content: '⏹️ Playback stopped.', embeds: [], components: []};

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(payload);
        } else {
          await interaction.update(payload);
        }
      }
    } catch {
      // If message was deleted or can't be updated, fall back to ack.
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
      }
    }
  }

  private async showQueue(interaction: PlaybackComponentInteraction, player: Player): Promise<void> {
    if (!player.getCurrent()) {
      await interaction.reply({content: errorMsg('Nothing is playing'), flags: MessageFlags.Ephemeral});
      return;
    }

    await interaction.reply({
      embeds: [buildQueueEmbed(player, 1, QUEUE_PAGE_SIZE_DEFAULT)],
      flags: MessageFlags.Ephemeral,
    });
  }

  /** Opens the compact action menu's selected utility without changing playback. */
  private async handleSecondaryAction(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.guild || !interaction.member) {
      return;
    }

    const [action] = interaction.values;
    const player = this.playerManager.get(interaction.guild.id);

    if (action === 'queue') {
      await this.showQueue(interaction, player);
      return;
    }

    if (!getMemberVoiceChannel(interaction.member as GuildMember)) {
      await interaction.reply({content: errorMsg('You must be in a voice channel'), flags: MessageFlags.Ephemeral});
      return;
    }

    if (action === 'search') {
      await this.showSearchModal(interaction);
      return;
    }

    if (action === 'seek') {
      const song = player.getCurrent();
      if (!song || song.isLive || song.length <= 0) {
        await interaction.reply({content: errorMsg('This track can\'t be seeked'), flags: MessageFlags.Ephemeral});
        return;
      }

      await this.showSeekModal(interaction);
    }
  }

  private async showSearchModal(interaction: PlaybackComponentInteraction): Promise<void> {
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
  }

  private async showSeekModal(interaction: PlaybackComponentInteraction): Promise<void> {
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
  }

  /**
   * Runs a playback action that can fail (stream errors, lost connection) without
   * clobbering the now-playing message with an error string.
   */
  private async runPlayerAction(interaction: ButtonInteraction, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error: unknown) {
      const content = errorMsg(formatError(error));

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({content, flags: MessageFlags.Ephemeral});
        } else {
          await interaction.reply({content, flags: MessageFlags.Ephemeral});
        }
      } catch {
        // The interaction may already be gone; nothing else we can do.
      }
    }
  }

  /**
   * Cycles loop mode: off -> track -> queue -> off, skipping queue looping
   * when there's nothing queued to loop.
   */
  private cycleLoopMode(player: Player): void {
    if (player.loopCurrentSong) {
      player.loopCurrentSong = false;
      player.loopCurrentQueue = player.queueSize() > 0;
      return;
    }

    if (player.loopCurrentQueue) {
      player.loopCurrentQueue = false;
      return;
    }

    player.loopCurrentSong = true;
  }

  /**
   * Clamps a relative seek to the bounds of the current song, or returns null
   * when the current song can't be seeked (live streams, unknown length).
   */
  private getSeekTarget(player: Player, deltaSeconds: number): number | null {
    const song = player.getCurrent();

    if (!song || song.isLive || song.length <= 0) {
      return null;
    }

    const maxPosition = Math.max(0, song.length - 1);
    return Math.min(Math.max(player.getPosition() + deltaSeconds, 0), maxPosition);
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
