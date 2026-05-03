import { SlashCommandBuilder } from '@discordjs/builders';
import { ApplicationIntegrationType, InteractionContextType } from 'discord-api-types/v10';
import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeGlobalCommand, serializeGuildCommand } from '../src/utils/serialize-command.js';

const createCommand = () => new SlashCommandBuilder()
  .setName('ping')
  .setDescription('check whether the bot can respond');

test('serializeGlobalCommand limits global commands to guild contexts', () => {
  const serializedCommand = serializeGlobalCommand(createCommand());

  assert.deepEqual(serializedCommand.contexts, [InteractionContextType.Guild]);
  assert.equal(serializedCommand.dm_permission, false);
  assert.deepEqual(serializedCommand.integration_types, [ApplicationIntegrationType.GuildInstall]);
});

test('serializeGuildCommand strips global-only availability fields', () => {
  const serializedCommand = serializeGuildCommand(
    createCommand()
      .setContexts(InteractionContextType.BotDM)
      .setDMPermission(true)
      .setIntegrationTypes(ApplicationIntegrationType.UserInstall),
  );

  assert.equal(serializedCommand.contexts, undefined);
  assert.equal(serializedCommand.dm_permission, undefined);
  assert.equal(serializedCommand.integration_types, undefined);
});
