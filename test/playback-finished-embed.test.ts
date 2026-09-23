// File: test/playback-finished-embed.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';
import type Player from '../src/services/player.js';
import { STATUS } from '../src/services/player.js';
import { buildPlaybackControls, buildPlaybackFinishedControls, buildPlaybackFinishedEmbed } from '../src/utils/build-embed.js';

const createFinishedPlayerStub = (canGoBack: boolean): Player => ({
  status: STATUS.IDLE,
  loopCurrentSong: false,
  loopCurrentQueue: false,
  getCurrent: () => null,
  canGoBack: () => canGoBack,
  canGoToNextSong: () => false,
  queueSize: () => 0,
  getVolume: () => 100,
  getAiSuggestions: () => [],
} as unknown as Player);

const createPlayingPlayerStub = (): Player => ({
  status: STATUS.PLAYING,
  loopCurrentSong: false,
  loopCurrentQueue: false,
  getCurrent: () => ({title: 'Toxic'}),
  canGoBack: () => true,
  canGoToNextSong: () => true,
  queueSize: () => 3,
  getVolume: () => 50,
  getAiSuggestions: () => [],
} as unknown as Player);

test('an active player renders the 5-4 control layout', () => {
  const rows = buildPlaybackControls(createPlayingPlayerStub()).map(row => row.toJSON().components ?? []);

  assert.deepEqual(rows.map(row => row.length), [5, 4]);
  // Row 1: loop, shuffle, previous, toggle, next.
  assert.deepEqual(rows[0]?.map(component => component.custom_id), [
    'playback:loop',
    'playback:shuffle',
    'playback:prev',
    'playback:toggle',
    'playback:next',
  ]);
  // Row 2: stop, queue, volume down, volume up.
  assert.deepEqual(rows[1]?.map(component => component.custom_id), [
    'playback:stop',
    'playback:queue',
    'playback:volume-down',
    'playback:volume-up',
  ]);
  assert.equal(rows.flat().every(component => component.disabled === false), true);
});

test('a finished queue with history offers only a Replay button', () => {
  const rows = buildPlaybackFinishedControls(createFinishedPlayerStub(true)).map(row => row.toJSON().components ?? []);

  assert.deepEqual(rows.map(row => row.length), [1]);
  assert.equal(rows[0]?.[0]?.custom_id, 'playback:prev');
  assert.equal(rows[0]?.[0]?.disabled, false);
  assert.equal((rows[0]?.[0] as {label?: string}).label, 'Replay');

  const embed = buildPlaybackFinishedEmbed(createFinishedPlayerStub(true)).toJSON();
  assert.match(embed.description ?? '', /⏮️/);
  assert.match(embed.description ?? '', /\/play/);
  assert.deepEqual(embed.fields?.map(field => field.name), ['STATE', 'VOLUME', 'REPEAT']);
});

test('a finished queue with no history offers no buttons at all', () => {
  const rows = buildPlaybackFinishedControls(createFinishedPlayerStub(false));

  assert.deepEqual(rows, []);
});
