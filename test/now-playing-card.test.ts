// File: test/now-playing-card.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';
import { ComponentType, MessageFlags, type APIComponentInContainer, type APIContainerComponent } from 'discord.js';
import type Player from '../src/services/player.js';
import { MediaSource, STATUS, type QueuedSong } from '../src/services/player.js';
import { buildNowPlayingMessage, PLAYING_PROGRESS_BAR_SEGMENTS, type PlayerCardMessage } from '../src/utils/build-embed.js';

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
  canGoBack: () => true,
  canGoToNextSong: () => true,
  getAiSuggestions: () => [],
} as unknown as Player);

const getContainer = (message: PlayerCardMessage): APIContainerComponent => {
  const container = message.components.at(-1)!.toJSON();
  assert.equal(container.type, ComponentType.Container);
  return container as APIContainerComponent;
};

const textsOf = (components: APIComponentInContainer[]): string[] => components
  .filter(component => component.type === ComponentType.TextDisplay)
  .map(component => (component as {content: string}).content);

test('the card puts the cover beside the title and the timeline below at full width', () => {
  const message = buildNowPlayingMessage(createPlayerStub(song, 120));

  assert.equal(message.flags, MessageFlags.IsComponentsV2);
  assert.deepEqual(message.embeds, []);
  assert.deepEqual(message.allowedMentions, {parse: []});

  const container = getContainer(message);
  assert.equal(container.accent_color, 0x57F287);

  // First block: the section with the cover as its right-hand accessory.
  const [section, separator, ...rest] = container.components;
  assert.equal(section?.type, ComponentType.Section);
  if (section?.type !== ComponentType.Section) {
    return;
  }

  assert.equal(section.accessory.type, ComponentType.Thumbnail);
  assert.equal((section.accessory as {media: {url: string}}).media.url, 'https://example.com/homework.jpg');
  const [heading, details] = section.components.map(component => component.content);
  assert.match(heading ?? '', /NOW PLAYING/);
  assert.match(heading ?? '', /### Around the World/);
  assert.match(heading ?? '', /by \*\*Daft Punk\*\*  •  \*Homework\*/);
  assert.equal(details, '👤 <@42>  •  🔊 80%  •  🔁 Queue');

  assert.equal(separator?.type, ComponentType.Separator);

  // Outside the section, so it spans the whole card.
  const [timeline, footer] = textsOf(rest);
  assert.ok(timeline?.startsWith('`02:00` '));
  assert.ok(timeline?.endsWith(' `07:09`'));
  const bar = timeline!.slice('`02:00` '.length, -' `07:09`'.length);
  assert.equal([...bar].length, PLAYING_PROGRESS_BAR_SEGMENTS);
  assert.equal(footer, '-# Starchild  •  4 songs queued');

  // Controls live inside the card: the 5-4 rows.
  const rows = rest.filter(component => component.type === ComponentType.ActionRow);
  assert.deepEqual(rows.map(row => row.components.length), [5, 4]);
});

test('announcement cards carry a note and no controls', () => {
  const message = buildNowPlayingMessage(createPlayerStub(song, 0), {controls: false, note: 'keep \'er movin\''});

  assert.equal(message.components.length, 2);
  assert.deepEqual(message.components[0]?.toJSON(), {type: ComponentType.TextDisplay, content: 'keep \'er movin\''});
  assert.equal(getContainer(message).components.some(component => component.type === ComponentType.ActionRow), false);
});

test('without cover art the heading stands alone instead of in a section', () => {
  const container = getContainer(buildNowPlayingMessage(createPlayerStub({...song, thumbnailUrl: null}, 0)));

  assert.equal(container.components.some(component => component.type === ComponentType.Section), false);
  assert.match(textsOf(container.components)[0] ?? '', /### Around the World/);
});

test('a live stream shows a broadcast badge instead of a bar', () => {
  const container = getContainer(buildNowPlayingMessage(createPlayerStub({...song, isLive: true, source: MediaSource.HLS}, 30)));
  const texts = textsOf(container.components);

  assert.ok(texts.includes('🔴 `LIVE BROADCAST`'));
  assert.equal(texts.some(text => text.includes('🔘')), false);
});

test('markdown in track metadata is escaped', () => {
  const container = getContainer(buildNowPlayingMessage(createPlayerStub({...song, title: '*NSYNC_Mix'}, 0)));
  const section = container.components[0];
  assert.equal(section?.type, ComponentType.Section);
  if (section?.type === ComponentType.Section) {
    assert.match(section.components[0]?.content ?? '', /### \\\*NSYNC\\_Mix/);
  }
});
