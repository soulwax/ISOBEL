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

// The now-playing card has room for a fuller timeline than the compact queue
// preview, which continues to use PROGRESS_BAR_SEGMENTS.
const PLAYING_PROGRESS_BAR_SEGMENTS = 30;

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
  const volume = player.getVolume();
  const loop = getLoopPresentation(player);
  const album = currentlyPlaying.album?.trim() ?? 'Unknown album';
  const timeline = currentlyPlaying.isLive
    ? '🔴 `LIVE BROADCAST`'
    : currentlyPlaying.length > 0
      ? `\`${prettyTime(player.getPosition())}\` ⏪ ${getProgressBar(PLAYING_PROGRESS_BAR_SEGMENTS, player.getPosition() / currentlyPlaying.length)} ⏩ \`${prettyTime(currentlyPlaying.length)}\``
      : `\`${prettyTime(player.getPosition())}\`  •  ⏱️ · duration unavailable`;
  const metadata = truncate(`${title} — ${artist} — ${album}`, 220);

  const message = new EmbedBuilder();
  message
    .setColor(status.color)
    .setTitle('ISOBEL — MUSIC')
    .setDescription([
      `**${metadata}** — wished by <@${requestedBy}>`,
      '',
      timeline,
      '',
      `**${getVolumeEmoji(volume)} Volume ${Number.isFinite(volume) ? `${volume}%` : '-'}   ${loop.emoji} Repeat ${loop.label}**`,
    ].join('\n'));

  if (songUrl) {
    message.setURL(songUrl);
  }

  message.setFooter({
    text: [`Queue: ${getQueueInfo(player)}`, playlist?.title, getSourceLabel(currentlyPlaying)].filter(Boolean).join('  •  '),
  });

  if (thumbnailUrl) {
    // The cover sits beside the wide playback readout, like a compact player.
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

  // Row 1 - primary transport. Icon-only buttons deliberately keep all five
  // controls equal in size, with play/pause held in the visual centre.
  const previousButton = new ButtonBuilder()
    .setCustomId('playback:prev')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⏮️');

  const rewindButton = new ButtonBuilder()
    .setCustomId('playback:rewind')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⏪');

  const toggleButton = new ButtonBuilder()
    .setCustomId('playback:toggle')
    .setStyle(ButtonStyle.Primary)
    .setEmoji(isPlaying ? '⏸️' : '▶️');

  const fastForwardButton = new ButtonBuilder()
    .setCustomId('playback:fastforward')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⏩');

  const nextButton = new ButtonBuilder()
    .setCustomId('playback:next')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⏭️');

  // Row 2 - playback settings and exit. This mirrors the five-button transport row.
  const loopButton = new ButtonBuilder()
    .setCustomId('playback:loop')
    .setStyle(loop.isOn ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setEmoji(loop.emoji);

  const shuffleButton = new ButtonBuilder()
    .setCustomId('playback:shuffle')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🔀');

  const volumeDownButton = new ButtonBuilder()
    .setCustomId('playback:volume-down')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🔉');

  const volumeUpButton = new ButtonBuilder()
    .setCustomId('playback:volume-up')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🔊');

  const stopButton = new ButtonBuilder()
    .setCustomId('playback:stop')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('⏹️');

  // Library actions stay visible and direct; a menu made them easy to miss.
  const searchButton = new ButtonBuilder()
    .setCustomId('playback:search')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🔎');

  const queueButton = new ButtonBuilder()
    .setCustomId('playback:queue')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('📜');

  const seekButton = new ButtonBuilder()
    .setCustomId('playback:seek')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⏱️');

  const transportButtons = [
    ...(player.canGoBack() ? [previousButton] : []),
    ...(canSeek ? [rewindButton] : []),
    ...(currentSong ? [toggleButton] : []),
    ...(canSeek ? [fastForwardButton] : []),
    ...(player.canGoForward(1) ? [nextButton] : []),
  ];
  const playbackButtons = [
    ...(currentSong ? [loopButton] : []),
    ...(player.queueSize() >= 2 ? [shuffleButton] : []),
    ...(currentSong && volume > VOLUME_MIN ? [volumeDownButton] : []),
    ...(currentSong && volume < VOLUME_MAX ? [volumeUpButton] : []),
    ...(currentSong ? [stopButton] : []),
  ];
  const utilityButtons = [
    ...(currentSong ? [searchButton, queueButton] : []),
    ...(canSeek ? [seekButton] : []),
  ];
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  if (transportButtons.length > 0) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(transportButtons));
  }

  if (playbackButtons.length > 0) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(playbackButtons));
  }

  if (utilityButtons.length > 0) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(utilityButtons));
  }

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
