import { ApplicationIntegrationType, InteractionContextType, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord-api-types/v10';
import type Command from '../commands/index.js';

type SlashCommand = Command['slashCommand'];

export const serializeGlobalCommand = (command: SlashCommand): RESTPostAPIChatInputApplicationCommandsJSONBody => ({
  ...command.toJSON(),
  contexts: [InteractionContextType.Guild],
  dm_permission: false,
  integration_types: [ApplicationIntegrationType.GuildInstall],
});

export const serializeGuildCommand = (command: SlashCommand): RESTPostAPIChatInputApplicationCommandsJSONBody => {
  const serializedCommand = command.toJSON();
  const guildCommand = {...serializedCommand};

  delete guildCommand.contexts;
  delete guildCommand.dm_permission;
  delete guildCommand.integration_types;

  return guildCommand;
};
