// File: test/build-embed-pagination.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';
import type Player from '../src/services/player.js';
import { MediaSource, STATUS, type QueuedSong } from '../src/services/player.js';
import { buildQueueEmbed } from '../src/utils/build-embed.js';

const createSong = (index: number, overrides: Partial<QueuedSong> = {}): QueuedSong => ({
  title: `Song ${index}`,
  artist: 'Artist',
  url: `song-${index}`,
  length: 180,
  offset: 0,
  playlist: null,
  isLive: false,
  thumbnailUrl: null,
  source: MediaSource.Starchild,
  addedInChannelId: 'channel-id',
  requestedBy: 'user-id',
  ...overrides,
});

const createPlayerStub = (queuedSongCount: number): Player => {
  const currentlyPlaying = createSong(0, {title: 'Current Song'});
  const queuedSongs = Array.from({length: queuedSongCount}, (_value, index) => createSong(index + 1));

  return {
    status: STATUS.PLAYING,
    loopCurrentSong: false,
    loopCurrentQueue: false,
    getCurrent: () => currentlyPlaying,
    queueSize: () => queuedSongs.length,
    getQueue: () => queuedSongs,
    getPosition: () => 30,
    getVolume: () => 50,
  } as unknown as Player;
};

test('buildQueueEmbed rejects page values below 1', () => {
  const player = createPlayerStub(3);
  assert.throws(
    () => buildQueueEmbed(player, 0, 10),
    /queue isn't that big/,
  );
});

test('buildQueueEmbed rejects empty overflow page when queue fits one page exactly', () => {
  const player = createPlayerStub(10);
  assert.throws(
    () => buildQueueEmbed(player, 2, 10),
    /queue isn't that big/,
  );
});

test('buildQueueEmbed reports correct page total for exact page-size queue', () => {
  const player = createPlayerStub(10);
  const embed = buildQueueEmbed(player, 1, 10);
  const pageField = embed.toJSON().fields?.find(field => field.name === 'Page');

  assert.equal(pageField?.value, '1 out of 1');
});

test('buildQueueEmbed rejects pageSize values below 1', () => {
  const player = createPlayerStub(1);
  assert.throws(
    () => buildQueueEmbed(player, 1, 0),
    /page size must be at least 1/,
  );
});
