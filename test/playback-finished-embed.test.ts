// File: test/playback-finished-embed.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';
import type Player from '../src/services/player.js';
import { STATUS } from '../src/services/player.js';
import { ComponentType, MessageFlags, type APIContainerComponent } from 'discord.js';
import { buildPlaybackControls, buildPlaybackFinishedControls, buildPlaybackFinishedMessage } from '../src/utils/build-embed.js';

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

  const message = buildPlaybackFinishedMessage(createFinishedPlayerStub(true));
  assert.equal(message.flags, MessageFlags.IsComponentsV2);
  const container = message.components[0]!.toJSON() as APIContainerComponent;
  const texts = container.components
    .filter(component => component.type === ComponentType.TextDisplay)
    .map(component => (component as {content: string}).content);
  assert.match(texts[0] ?? '', /QUEUE COMPLETE/);
  assert.match(texts[0] ?? '', /⏮️/);
  assert.match(texts[0] ?? '', /\/play/);
  assert.equal(texts[1], 'Queue complete  •  🔊 100%  •  🔁 Off');
  // The Replay button sits inside the card.
  const cardRows = container.components.filter(component => component.type === ComponentType.ActionRow);
  assert.equal(cardRows[0]?.components[0]?.custom_id, 'playback:prev');
});

test('a finished queue with no history offers no buttons at all', () => {
  const rows = buildPlaybackFinishedControls(createFinishedPlayerStub(false));

  assert.deepEqual(rows, []);
});
