// File: test/play-features.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';
import { MediaSource, type SongMetadata } from '../src/services/player.js';
import { buildSongQueuedControls, buildSongQueuedEmbed } from '../src/utils/build-embed.js';
import getStarchildSuggestionsFor from '../src/utils/get-starchild-suggestions-for.js';

test('getStarchildSuggestionsFor formats choice name with duration and sets track ID in value', async () => {
  const mockStarchildAPI = {
    search: async () => [
      {
        title: 'Starboy',
        artist: 'The Weeknd',
        album: 'Starboy',
        url: '138545815',
        length: 230,
        offset: 0,
        playlist: null,
        isLive: false,
        thumbnailUrl: 'https://example.com/cover.jpg',
        source: MediaSource.Starchild,
      } as SongMetadata,
    ],
  };

  const suggestions = await getStarchildSuggestionsFor('starboy', mockStarchildAPI as any, 10);

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].name, 'Starboy - The Weeknd [03:50]');
  assert.equal(suggestions[0].value, 'track:138545815');
});

test('getStarchildSuggestionsFor safely truncates long track labels to under 100 characters', async () => {
  const veryLongTitle = 'A'.repeat(80);
  const veryLongArtist = 'B'.repeat(80);

  const mockStarchildAPI = {
    search: async () => [
      {
        title: veryLongTitle,
        artist: veryLongArtist,
        album: 'Very Long Album',
        url: '999999999',
        length: 300,
        offset: 0,
        playlist: null,
        isLive: false,
        thumbnailUrl: null,
        source: MediaSource.Starchild,
      } as SongMetadata,
    ],
  };

  const suggestions = await getStarchildSuggestionsFor('long', mockStarchildAPI as any, 10);

  assert.equal(suggestions.length, 1);
  assert.ok(suggestions[0].name.length <= 100, `Name length was ${suggestions[0].name.length}, expected <= 100`);
  assert.ok(suggestions[0].name.endsWith('[05:00]'));
  assert.equal(suggestions[0].value, 'track:999999999');
});

test('buildSongQueuedEmbed correctly sets fields, duration, and position', () => {
  const song: SongMetadata = {
    title: 'Around the World',
    artist: 'Daft Punk',
    album: 'Homework',
    url: '3135556',
    length: 429,
    offset: 0,
    playlist: null,
    isLive: false,
    thumbnailUrl: 'https://example.com/daft.jpg',
    source: MediaSource.Starchild,
  };

  const embed = buildSongQueuedEmbed(song, {
    queuePosition: 3,
    estimatedWaitSeconds: 310,
    requestedBy: 'Soulwax',
    immediate: false,
  });

  const json = embed.toJSON();
  assert.equal(json.title, '➕ Added to queue');
  assert.ok(json.description?.includes('Around the World'));
  assert.ok(json.description?.includes('Daft Punk'));
  assert.ok(json.description?.includes('Homework'));

  const durationField = json.fields?.find(f => f.name.includes('Duration'));
  assert.equal(durationField?.value, '`07:09`');

  const positionField = json.fields?.find(f => f.name.includes('Position'));
  assert.equal(positionField?.value, '`#3`');

  const waitField = json.fields?.find(f => f.name.includes('Wait'));
  assert.equal(waitField?.value, '`~05:10`');

  assert.equal(json.thumbnail?.url, 'https://example.com/daft.jpg');
  assert.ok(json.footer?.text.includes('Requested by Soulwax'));
});

test('buildSongQueuedControls renders Play Next, Remove, and View Queue buttons', () => {
  const song: SongMetadata = {
    title: 'Instant Crush',
    artist: 'Daft Punk',
    url: '69309257',
    length: 337,
    offset: 0,
    playlist: null,
    isLive: false,
    thumbnailUrl: null,
    source: MediaSource.Starchild,
  };

  const controls = buildSongQueuedControls(song, false);
  assert.equal(controls.length, 1);

  const row = controls[0].toJSON();
  assert.equal(row.components.length, 3);
  assert.equal((row.components[0] as any).custom_id, 'play:bump:69309257');
  assert.equal((row.components[1] as any).custom_id, 'play:undo:69309257');
  assert.equal((row.components[2] as any).custom_id, 'playback:queue');
});

test('buildSongQueuedControls omits Play Next button when song was queued with immediate', () => {
  const song: SongMetadata = {
    title: 'One More Time',
    artist: 'Daft Punk',
    url: '3135553',
    length: 320,
    offset: 0,
    playlist: null,
    isLive: false,
    thumbnailUrl: null,
    source: MediaSource.Starchild,
  };

  const controls = buildSongQueuedControls(song, true);
  assert.equal(controls.length, 1);

  const row = controls[0].toJSON();
  assert.equal(row.components.length, 2);
  assert.equal((row.components[0] as any).custom_id, 'play:undo:3135553');
  assert.equal((row.components[1] as any).custom_id, 'playback:queue');
});
