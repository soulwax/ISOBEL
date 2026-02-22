// File: src/utils/build-embed.ts

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import type Player from '../services/player.js';
import { STATUS, type QueuedSong } from '../services/player.js';
import { PROGRESS_BAR_SEGMENTS } from './constants.js';
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

const getSongTitle = ({title, artist}: QueuedSong, shouldTruncate = false) => {
  const cleanSongTitle = title.replace(/\[.*\]/, '').trim() || 'Unknown title';
  const cleanArtist = artist.trim() || 'Unknown artist';

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

const getPlayerUI = (player: Player) => {
  const song = player.getCurrent();

  if (!song) {
    return '';
  }

  const position = player.getPosition();
  const button = player.status === STATUS.PLAYING ? '⏹️' : '▶️';
  const progressBar = getProgressBar(PROGRESS_BAR_SEGMENTS, position / song.length);
  const elapsedTime = song.isLive ? 'live' : `${prettyTime(position)}/${prettyTime(song.length)}`;
  const loop = player.loopCurrentSong ? '🔂' : player.loopCurrentQueue ? '🔁' : '';
  const volume = player.getVolume();
  const vol = Number.isFinite(volume) ? `${volume}%` : '-';
  return `${button} ${progressBar} \`[${elapsedTime}]\`🔉 ${vol} ${loop}`;
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

  const {artist, thumbnailUrl, requestedBy} = currentlyPlaying;
  const message = new EmbedBuilder();
  message
    .setColor(player.status === STATUS.PLAYING ? 'DarkGreen' : 'DarkRed')
    .setTitle(player.status === STATUS.PLAYING ? 'Now Playing' : 'Paused')
    .setDescription(`
      **${getSongTitle(currentlyPlaying)}**
      Requested by: <@${requestedBy}>\n
      ${getPlayerUI(player)}
    `)
    .setFooter({text: `Source: ${artist}`});

  if (thumbnailUrl) {
    message.setThumbnail(thumbnailUrl);
  }

  return message;
};

export const buildPlaybackControls = (player: Player): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] => {
  const isPlaying = player.status === STATUS.PLAYING;
  const canBack = player.canGoBack();
  const canSkip = player.canGoForward(1);

  const toggleButton = new ButtonBuilder()
    .setCustomId('playback:toggle')
    .setStyle(ButtonStyle.Secondary)
    .setLabel(isPlaying ? 'Pause' : 'Resume')
    .setEmoji(isPlaying ? '⏸️' : '▶️');

  const prevButton = new ButtonBuilder()
    .setCustomId('playback:prev')
    .setStyle(ButtonStyle.Secondary)
    .setLabel('Previous')
    .setEmoji('⏮️')
    .setDisabled(!canBack);

  const nextButton = new ButtonBuilder()
    .setCustomId('playback:next')
    .setStyle(ButtonStyle.Primary)
    .setLabel('Next')
    .setEmoji('⏭️')
    .setDisabled(!canSkip);

  const searchButton = new ButtonBuilder()
    .setCustomId('playback:search')
    .setStyle(ButtonStyle.Secondary)
    .setLabel('Search')
    .setEmoji('🔎');

  const stopButton = new ButtonBuilder()
    .setCustomId('playback:stop')
    .setStyle(ButtonStyle.Danger)
    .setLabel('Stop')
    .setEmoji('⏹️');

  const primaryRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(toggleButton, prevButton, nextButton, searchButton, stopButton);

  const seekButton = new ButtonBuilder()
    .setCustomId('playback:seek')
    .setStyle(ButtonStyle.Secondary)
    .setLabel('Seek')
    .setEmoji('⏩');

  const secondaryRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(seekButton);

  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [primaryRow, secondaryRow];
  const suggestions = player.getAiSuggestions();
  if (suggestions.length > 0) {
    const options = suggestions.slice(0, 5).map(value => ({
      label: truncate(value, 100),
      value,
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('playback:suggest')
      .setPlaceholder('Suggested by AI')
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
  const maxQueuePage = Math.ceil((queueSize + 1) / pageSize);

  if (page > maxQueuePage) {
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

  const {artist, thumbnailUrl, playlist, requestedBy} = currentlyPlaying;
  const playlistTitle = playlist ? `(${playlist.title})` : '';
  const totalLength = player.getQueue().reduce((accumulator, current) => accumulator + current.length, 0);

  const message = new EmbedBuilder();

  let description = `**${getSongTitle(currentlyPlaying)}**\n`;
  description += `Requested by: <@${requestedBy}>\n\n`;
  description += `${getPlayerUI(player)}\n\n`;

  if (player.getQueue().length > 0) {
    description += '**Up next:**\n';
    description += queuedSongs;
  }

  message
    .setTitle(player.status === STATUS.PLAYING ? `Now Playing ${player.loopCurrentSong ? '(loop on)' : ''}` : 'Queued songs')
    .setColor(player.status === STATUS.PLAYING ? 'DarkGreen' : 'NotQuiteBlack')
    .setDescription(description)
    .addFields([{name: 'In queue', value: getQueueInfo(player), inline: true}, {
      name: 'Total length', value: `${totalLength > 0 ? prettyTime(totalLength) : '-'}`, inline: true,
    }, {name: 'Page', value: `${page} out of ${maxQueuePage}`, inline: true}])
    .setFooter({text: `Source: ${artist} ${playlistTitle}`});

  if (thumbnailUrl) {
    message.setThumbnail(thumbnailUrl);
  }

  return message;
};
