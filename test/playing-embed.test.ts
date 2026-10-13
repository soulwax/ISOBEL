// File: test/playing-embed.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';
import type Player from '../src/services/player.js';
import { MediaSource, STATUS, type QueuedSong } from '../src/services/player.js';
import { buildPlayingMessageEmbed, PLAYING_PROGRESS_BAR_SEGMENTS } from '../src/utils/build-embed.js';

const song: QueuedSong = {
  title: 'Around the World',
  artist: 'Daft Punk',
  album: 'Homework',
  url: '3135556',
  length: 429,
  offset: 0,
  playlist: null,
  isLive: false,
  thumbnailUrl: 'https://example.com/homework.jpg',
  source: MediaSource.Starchild,
  addedInChannelId: '1',
  requestedBy: '42',
};

const createPlayerStub = (current: QueuedSong, position: number): Player => ({
  status: STATUS.PLAYING,
  loopCurrentSong: false,
  loopCurrentQueue: true,
  getCurrent: () => current,
  getPosition: () => position,
  getVolume: () => 80,
  queueSize: () => 4,
} as unknown as Player);

test('the now-playing card gives the timeline the full width', () => {
  const embed = buildPlayingMessageEmbed(createPlayerStub(song, 120)).toJSON();

  // Cover art moves into the header so it no longer narrows the description.
  assert.equal(embed.thumbnail, undefined);
  assert.equal(embed.author?.icon_url, 'https://example.com/homework.jpg');
  assert.match(embed.author?.name ?? '', /NOW PLAYING/);

  const timeline = (embed.description ?? '').split('\n').find(line => line.includes('🔘'));
  assert.ok(timeline, 'description carries a progress bar');
  assert.ok(timeline.startsWith('`02:00`'));
  assert.ok(timeline.endsWith('`07:09`'));
  const bar = timeline.slice('`02:00` '.length, -' `07:09`'.length);
  assert.equal([...bar].length, PLAYING_PROGRESS_BAR_SEGMENTS);

  assert.deepEqual(embed.fields?.map(field => field.name), ['REQUESTED BY', 'VOLUME', 'REPEAT']);
  assert.equal(embed.fields?.every(field => field.inline), true);
  assert.equal(embed.fields?.[0]?.value, '<@42>');
  assert.equal(embed.fields?.[1]?.value, '🔊 80%');
  assert.equal(embed.fields?.[2]?.value, '🔁 Queue');
});

test('a track without cover art still renders the wide card', () => {
  const embed = buildPlayingMessageEmbed(createPlayerStub({...song, thumbnailUrl: null}, 0)).toJSON();

  assert.equal(embed.author?.icon_url, undefined);
  assert.equal(embed.thumbnail, undefined);
  assert.match(embed.description ?? '', /🔘/);
});

test('a live stream shows a broadcast badge instead of a bar', () => {
  const embed = buildPlayingMessageEmbed(createPlayerStub({...song, isLive: true, source: MediaSource.HLS}, 30)).toJSON();

  assert.match(embed.description ?? '', /LIVE BROADCAST/);
  assert.doesNotMatch(embed.description ?? '', /🔘/);
});
