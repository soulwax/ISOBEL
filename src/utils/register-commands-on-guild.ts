// File: src/utils/register-commands-on-guild.ts

import { type REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import type Command from '../commands/index.js';
import { serializeGuildCommand } from './serialize-command.js';

interface RegisterCommandsOnGuildOptions {
  rest: REST;
  applicationId: string;
  guildId: string;
  commands: Command['slashCommand'][];
}

const registerCommandsOnGuild = async ({rest, applicationId, guildId, commands}: RegisterCommandsOnGuildOptions) => {
  await rest.put(
    Routes.applicationGuildCommands(applicationId, guildId),
    {body: commands.map(command => serializeGuildCommand(command))},
  );
};

export default registerCommandsOnGuild;
