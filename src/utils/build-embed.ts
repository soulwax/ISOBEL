// File: src/utils/build-embed.ts

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import type Player from '../services/player.js';
import { MediaSource, STATUS, type QueuedSong } from '../services/player.js';
import { PROGRESS_BAR_SEGMENTS, VOLUME_MAX, VOLUME_MIN } from './constants.js';
import getProgressBar from './get-progress-bar.js';
import { truncate } from './string.js';
import { prettyTime } from './time.js';

const getMaxSongTitleLength = (title: string) => {
  // eslint-disable-next-line no-control-regex
  const nonASCII = /[^\x00-\x7F]+/;
  return nonASCII.test(title) ? 28 : 48;
};

const EXTERNAL_PLAYER_URL = process.env.EXTERNAL_PLAYER_URL?.trim() ?? '';
const SONG_LINK_TEMPLATE = process.env.SONG_LINK_URL_TEMPLATE?.trim() ?? '';
const AI_SUGGESTION_VALUE_PREFIX = 'ai-suggest:';

const EMBED_COLOR = {
  playing: 0x57F287,
  paused: 0xFEE75C,
  idle: 0x4E5058,
} as const;

const encodeDarkfloorPart = (value: string): string => encodeURIComponent(value.trim().replace(/\s+/g, ' ')).replace(/%20/g, '+');
const buildSongLinkFromTemplate = (template: string, encodedArtist: string, encodedTitle: string, encodedQuery: string): string => template
  .replaceAll('{artist}', encodedArtist)
  .replaceAll('{title}', encodedTitle)
  .replaceAll('{query}', encodedQuery);

const buildSongLink = (artist: string, title: string): string | null => {
  if (EXTERNAL_PLAYER_URL === '' && SONG_LINK_TEMPLATE === '') {
    return null;
  }

  const encodedArtist = encodeDarkfloorPart(artist);
  const encodedTitle = encodeDarkfloorPart(title);
  const encodedQuery = `${encodedArtist}+${encodedTitle}`;

  if (EXTERNAL_PLAYER_URL !== '') {
    if (EXTERNAL_PLAYER_URL.includes('{')) {
      return buildSongLinkFromTemplate(EXTERNAL_PLAYER_URL, encodedArtist, encodedTitle, encodedQuery);
    }

    return `${EXTERNAL_PLAYER_URL}${encodedQuery}`;
  }

  return buildSongLinkFromTemplate(SONG_LINK_TEMPLATE, encodedArtist, encodedTitle, encodedQuery);
};

const getCleanSongParts = ({title, artist}: QueuedSong) => ({
  title: title.replace(/\[.*\]/, '').trim() || 'Unknown title',
  artist: artist.trim() || 'Unknown artist',
});

const getSongTitle = (song: QueuedSong, shouldTruncate = false) => {
  const {title: cleanSongTitle, artist: cleanArtist} = getCleanSongParts(song);

  const linkText = `${cleanSongTitle} - ${cleanArtist}`;
  const songTitle = shouldTruncate ? truncate(linkText, getMaxSongTitleLength(linkText)) : linkText;
  const songUrl = buildSongLink(cleanArtist, cleanSongTitle);

  if (!songUrl) {
    return songTitle;
  }

  return `[${songTitle}](${songUrl})`;
};

const getQueueInfo = (player: Player) => {
  const queueSize = player.queueSize();
  if (queueSize === 0) {
    return '-';
  }

  return queueSize === 1 ? '1 song' : `${queueSize} songs`;
};

const getStatusPresentation = (player: Player) => {
  switch (player.status) {
    case STATUS.PLAYING:
      return {label: 'Now Playing', emoji: '▶️', color: EMBED_COLOR.playing};
    case STATUS.PAUSED:
      return {label: 'Paused', emoji: '⏸️', color: EMBED_COLOR.paused};
    default:
      return {label: 'Idle', emoji: '⏹️', color: EMBED_COLOR.idle};
  }
};

const getLoopPresentation = (player: Player) => {
  if (player.loopCurrentSong) {
    return {label: 'Track', emoji: '🔂', isOn: true};
  }

  if (player.loopCurrentQueue) {
    return {label: 'Queue', emoji: '🔁', isOn: true};
  }

  return {label: 'Off', emoji: '🔁', isOn: false};
};

// Resolved lazily: player.ts and build-embed.ts import each other, so `MediaSource`
// isn't initialised yet while this module is being evaluated.
const getSourceLabel = (song: QueuedSong): string => {
  switch (song.source) {
    case MediaSource.Starchild:
      return 'Starchild';
    case MediaSource.HLS:
      return 'Live stream';
    case MediaSource.YouTube:
      return 'YouTube';
    case MediaSource.DiscordAttachment:
      return 'Direct file';
    default:
      return 'Unknown source';
  }
};

const getVolumeEmoji = (volume: number) => {
  if (volume === 0) {
    return '🔇';
  }

  return volume < 50 ? '🔉' : '🔊';
};

/**
 * Renders the two-line playback readout: progress bar on top, metadata below.
 */
const getPlayerUI = (player: Player) => {
  const song = player.getCurrent();

  if (!song) {
    return '';
  }

  const volume = player.getVolume();
  const meta: string[] = [];

  if (song.isLive) {
    meta.push('🔴 `LIVE`');
  } else {
    const position = player.getPosition();
    meta.push(`\`${prettyTime(position)} / ${prettyTime(song.length)}\``);
  }

  meta.push(`${getVolumeEmoji(volume)} \`${Number.isFinite(volume) ? `${volume}%` : '-'}\``);

  const loop = getLoopPresentation(player);
  if (loop.isOn) {
    meta.push(`${loop.emoji} \`${loop.label}\``);
  }

  if (song.isLive) {
    return meta.join(' • ');
  }

  const progress = song.length > 0 ? player.getPosition() / song.length : 0;

  return `${getProgressBar(PROGRESS_BAR_SEGMENTS, progress)}\n${meta.join(' • ')}`;
};

/**
 * Builds a Discord embed for the currently playing song
 * @param player - The player instance containing the current song and status
 * @returns A Discord embed builder with song information
 * @throws {Error} If no song is currently playing
 */
export const buildPlayingMessageEmbed = (player: Player): EmbedBuilder => {
  const currentlyPlaying = player.getCurrent();

  if (!currentlyPlaying) {
    throw new Error('No playing song found');
  }

  const {thumbnailUrl, requestedBy, playlist} = currentlyPlaying;
  const {title, artist} = getCleanSongParts(currentlyPlaying);
  const status = getStatusPresentation(player);
  const songUrl = buildSongLink(artist, title);

  const message = new EmbedBuilder();
  message
    .setColor(status.color)
    .setAuthor({name: `${status.emoji} ${status.label}`})
    .setTitle(truncate(title, 100))
    .setDescription([
      `**${artist}**`,
      '',
      getPlayerUI(player),
      '',
      `-# Requested by <@${requestedBy}>`,
    ].join('\n'));

  if (songUrl) {
    message.setURL(songUrl);
  }

  const [upNext] = player.getQueue();
  if (upNext) {
    message.addFields({name: 'Up next', value: getSongTitle(upNext, true), inline: true});
  }

  message.addFields({name: 'In queue', value: getQueueInfo(player), inline: true});

  message.setFooter({
    text: [`Source: ${getSourceLabel(currentlyPlaying)}`, playlist?.title].filter(Boolean).join(' • '),
  });

  if (thumbnailUrl) {
    message.setThumbnail(thumbnailUrl);
  }

  return message;
};

export const buildPlaybackControls = (player: Player): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] => {
  const isPlaying = player.status === STATUS.PLAYING;
  const currentSong = player.getCurrent();
  const canSeek = Boolean(currentSong) && !currentSong!.isLive && currentSong!.length > 0;
  const volume = player.getVolume();
  const loop = getLoopPresentation(player);

  // Row 1 - transport, laid out like a physical player: back, rewind, play/pause, forward, skip.
  const previousButton = new ButtonBuilder()
    .setCustomId('playback:prev')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⏮️')
    .setDisabled(!player.canGoBack());

  const rewindButton = new ButtonBuilder()
    .setCustomId('playback:rewind')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⏪')
    .setDisabled(!canSeek);

  const toggleButton = new ButtonBuilder()
    .setCustomId('playback:toggle')
    .setStyle(ButtonStyle.Primary)
    .setLabel(isPlaying ? 'Pause' : 'Play')
    .setEmoji(isPlaying ? '⏸️' : '▶️')
    .setDisabled(!currentSong);

  const fastForwardButton = new ButtonBuilder()
    .setCustomId('playback:fastforward')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⏩')
    .setDisabled(!canSeek);

  const nextButton = new ButtonBuilder()
    .setCustomId('playback:next')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⏭️')
    .setDisabled(!player.canGoForward(1));

  // Row 2 - mix: how it repeats, how it's ordered, how loud, and the way out.
  const loopButton = new ButtonBuilder()
    .setCustomId('playback:loop')
    .setStyle(loop.isOn ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setLabel(`Loop: ${loop.label}`)
    .setEmoji(loop.emoji)
    .setDisabled(!currentSong);

  const shuffleButton = new ButtonBuilder()
    .setCustomId('playback:shuffle')
    .setStyle(ButtonStyle.Secondary)
    .setLabel('Shuffle')
    .setEmoji('🔀')
    .setDisabled(player.queueSize() < 2);

  const volumeDownButton = new ButtonBuilder()
    .setCustomId('playback:volume-down')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🔉')
    .setDisabled(volume <= VOLUME_MIN);

  const volumeUpButton = new ButtonBuilder()
    .setCustomId('playback:volume-up')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🔊')
    .setDisabled(volume >= VOLUME_MAX);

  const stopButton = new ButtonBuilder()
    .setCustomId('playback:stop')
    .setStyle(ButtonStyle.Danger)
    .setLabel('Stop')
    .setEmoji('⏹️');

  // Row 3 - library: everything that opens something instead of changing playback.
  const searchButton = new ButtonBuilder()
    .setCustomId('playback:search')
    .setStyle(ButtonStyle.Secondary)
    .setLabel('Search')
    .setEmoji('🔎');

  const queueButton = new ButtonBuilder()
    .setCustomId('playback:queue')
    .setStyle(ButtonStyle.Secondary)
    .setLabel('Queue')
    .setEmoji('📜');

  const seekButton = new ButtonBuilder()
    .setCustomId('playback:seek')
    .setStyle(ButtonStyle.Secondary)
    .setLabel('Seek')
    .setEmoji('⏱️')
    .setDisabled(!canSeek);

  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>()
      .addComponents(previousButton, rewindButton, toggleButton, fastForwardButton, nextButton),
    new ActionRowBuilder<ButtonBuilder>()
      .addComponents(loopButton, shuffleButton, volumeDownButton, volumeUpButton, stopButton),
    new ActionRowBuilder<ButtonBuilder>()
      .addComponents(searchButton, queueButton, seekButton),
  ];

  const suggestions = player.getAiSuggestions();
  if (suggestions.length > 0) {
    const options = suggestions.slice(0, 5).map((value, index) => ({
      label: truncate(value, 100),
      value: `${AI_SUGGESTION_VALUE_PREFIX}${index}`,
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('playback:suggest')
      .setPlaceholder('✨ Suggested by AI')
      .addOptions(options);

    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(selectMenu)
    );
  }

  return rows;
};

/**
 * Builds a Discord embed showing the queue with pagination
 * @param player - The player instance containing the queue
 * @param page - The page number to display (1-indexed)
 * @param pageSize - The number of songs to display per page
 * @returns A Discord embed builder with queue information
 * @throws {Error} If the queue is empty or the page number is invalid
 */
export const buildQueueEmbed = (player: Player, page: number, pageSize: number): EmbedBuilder => {
  const currentlyPlaying = player.getCurrent();

  if (!currentlyPlaying) {
    throw new Error('queue is empty');
  }

  const queueSize = player.queueSize();
  if (pageSize < 1) {
    throw new Error('page size must be at least 1');
  }

  const maxQueuePage = Math.max(1, Math.ceil(queueSize / pageSize));

  if (page < 1 || page > maxQueuePage) {
    throw new Error('the queue isn\'t that big');
  }

  const queuePageBegin = (page - 1) * pageSize;
  const queuePageEnd = queuePageBegin + pageSize;
  const queuedSongs = player
    .getQueue()
    .slice(queuePageBegin, queuePageEnd)
    .map((song, index) => {
      const songNumber = index + 1 + queuePageBegin;
      const duration = song.isLive ? 'live' : prettyTime(song.length);

      return `\`${songNumber}.\` ${getSongTitle(song, true)} \`[${duration}]\``;
    })
    .join('\n');

  const {thumbnailUrl, playlist, requestedBy} = currentlyPlaying;
  const status = getStatusPresentation(player);
  const totalLength = player.getQueue().reduce((accumulator, current) => accumulator + current.length, 0);

  const message = new EmbedBuilder();

  const description = [
    `**${getSongTitle(currentlyPlaying)}**`,
    getPlayerUI(player),
    `-# Requested by <@${requestedBy}>`,
  ];

  if (player.getQueue().length > 0) {
    description.push('', '**Up next**', queuedSongs);
  }

  message
    .setTitle(`${status.emoji} ${status.label}`)
    .setColor(status.color)
    .setDescription(description.join('\n'))
    .addFields([{name: 'In queue', value: getQueueInfo(player), inline: true}, {
      name: 'Total length', value: `${totalLength > 0 ? prettyTime(totalLength) : '-'}`, inline: true,
    }, {name: 'Page', value: `${page} out of ${maxQueuePage}`, inline: true}])
    .setFooter({
      text: [`Source: ${getSourceLabel(currentlyPlaying)}`, playlist?.title].filter(Boolean).join(' • '),
    });

  if (thumbnailUrl) {
    message.setThumbnail(thumbnailUrl);
  }

  return message;
};
