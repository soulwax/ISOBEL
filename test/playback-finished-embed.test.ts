// File: test/playback-finished-embed.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';
import type Player from '../src/services/player.js';
import { STATUS } from '../src/services/player.js';
import { buildPlaybackControls, buildPlaybackFinishedEmbed } from '../src/utils/build-embed.js';

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

test('finished playback preserves the 5-3-5 control layout', () => {
  const player = createFinishedPlayerStub(true);
  const rows = buildPlaybackControls(player).map(row => row.toJSON().components ?? []);

  assert.deepEqual(rows.map(row => row.length), [5, 3, 5]);
  assert.equal(rows[0]?.[0]?.disabled, false);
  assert.equal(rows[2]?.[2]?.custom_id, 'playback:search');
  assert.equal(rows[2]?.[2]?.disabled, false);
  const embed = buildPlaybackFinishedEmbed(player).toJSON();
  assert.match(embed.description ?? '', /⏮️/);
  assert.match(embed.description ?? '', /🔎/);
  assert.deepEqual(embed.fields?.map(field => field.name), ['STATE', 'VOLUME', 'REPEAT']);
});

test('finished playback without history keeps only search enabled', () => {
  const rows = buildPlaybackControls(createFinishedPlayerStub(false)).map(row => row.toJSON().components ?? []);
  const components = rows.flat();

  assert.equal(components.filter(component => component.disabled === false).length, 1);
  assert.equal(rows[2]?.[2]?.custom_id, 'playback:search');
});
