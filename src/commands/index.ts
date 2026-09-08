// File: src/commands/index.ts

import { type SlashCommandBuilder, type SlashCommandOptionsOnlyBuilder, type SlashCommandSubcommandsOnlyBuilder } from '@discordjs/builders';
import { type AutocompleteInteraction, type ButtonInteraction, type ChatInputCommandInteraction, type ModalSubmitInteraction, type StringSelectMenuInteraction } from 'discord.js';

export default interface Command {
  /**
   * Omitted by handlers that exist only to route component interactions, so
   * they aren't registered with Discord as a command nobody can usefully run.
   */
  readonly slashCommand?: (SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder) & Pick<SlashCommandBuilder, 'toJSON'>;
  readonly handledButtonIds?: readonly string[];
  readonly requiresVC?: boolean | ((interaction: ChatInputCommandInteraction) => boolean);
  execute?: (interaction: ChatInputCommandInteraction) => Promise<void>;
  handleButtonInteraction?: (interaction: ButtonInteraction) => Promise<void>;
  handleAutocompleteInteraction?: (interaction: AutocompleteInteraction) => Promise<void>;
  handleModalSubmit?: (interaction: ModalSubmitInteraction) => Promise<void>;
  handleSelectMenuInteraction?: (interaction: StringSelectMenuInteraction) => Promise<void>;
}
