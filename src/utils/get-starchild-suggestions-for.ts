// File: src/utils/get-starchild-suggestions-for.ts

import { type APIApplicationCommandOptionChoice } from 'discord-api-types/v10';
import type StarchildAPI from '../services/starchild-api.js';
import { truncate } from './string.js';
import { prettyTime } from './time.js';

const getStarchildSuggestionsFor = async (query: string, starchildAPI: StarchildAPI, limit = 10): Promise<APIApplicationCommandOptionChoice[]> => {
  const songs = await starchildAPI.search(query, limit);

  return songs.map(song => {
    const durationBadge = song.length > 0 ? ` [${prettyTime(song.length)}]` : '';
    const titleArtist = `${song.title} - ${song.artist}`;
    const availableLength = Math.max(10, 100 - durationBadge.length);
    const name = `${truncate(titleArtist, availableLength)}${durationBadge}`;

    return {
      name,
      value: `track:${song.url}`,
    };
  });
};

export default getStarchildSuggestionsFor;

