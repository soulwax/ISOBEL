// File: src/bot.ts

import { REST } from '@discordjs/rest';
import { generateDependencyReport } from '@discordjs/voice';
import { type AutocompleteInteraction, type ButtonInteraction, type ChatInputCommandInteraction, type Client, type ClientEvents, Collection, type Interaction, type ModalSubmitInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { inject, injectable } from 'inversify';
import ora, { type Ora } from 'ora';
import type Command from './commands/index.js';
import handleGuildCreate from './events/guild-create.js';
import handleVoiceStateUpdate from './events/voice-state-update.js';
import container from './inversify.config.js';
import type PlayerManager from './managers/player.js';
import type Config from './services/config.js';
import type HealthServer from './services/health-server.js';
import { TYPES } from './types.js';
import { isUserInVoice } from './utils/channels.js';
import { DISCORD_API_VERSION } from './utils/constants.js';
import debug from './utils/debug.js';
import errorMsg from './utils/error-msg.js';
import registerCommandsOnGuild from './utils/register-commands-on-guild.js';

/**
 * Bot permissions constant (required permissions for the bot)
 * Calculated as: Manage Channels (16) + Connect (1048576) + Speak (2097152) + Use Voice Activity (33554432)
 */
const BOT_REQUIRED_PERMISSIONS = 36700160;
const applicationCommandsRoute = (applicationId: string): `/applications/${string}/commands` => `/applications/${applicationId}/commands`;

@injectable()
export default class Bot {
  private readonly client: Client;
  private readonly config: Config;
  private readonly healthServer: HealthServer;
  private readonly playerManager: PlayerManager;
  private readonly shouldRegisterCommandsOnBot: boolean;
  private readonly commandsByName = new Collection<string, Command>();
  private readonly commandsByButtonId = new Collection<string, Command>();

  constructor(
    @inject(TYPES.Client) client: Client,
    @inject(TYPES.Config) config: Config,
    @inject(TYPES.Services.HealthServer) healthServer: HealthServer,
    @inject(TYPES.Managers.Player) playerManager: PlayerManager,
  ) {
    this.client = client;
    this.config = config;
    this.healthServer = healthServer;
    this.playerManager = playerManager;
    this.shouldRegisterCommandsOnBot = config.REGISTER_COMMANDS_ON_BOT;
  }

  public async register(): Promise<void> {
    this.loadCommands();

    this.registerEventHandlers();

    // Start health server before Discord login so container platforms can detect open port immediately.
    this.healthServer.start();

    const spinner = ora('📡 connecting to Discord...').start();
    this.onceAsync('ready', async () => this.onReady(spinner));

    await this.client.login(this.config.DISCORD_TOKEN);
  }

  private registerEventHandlers(): void {
    this.onAsync('interactionCreate', interaction => this.handleInteraction(interaction));
    this.client.on('error', error => this.logUnhandledError('client.error', error));
    this.client.on('debug', debug);
    this.onAsync('guildCreate', guild => handleGuildCreate(guild));
    this.client.on('guildDelete', guild => {
      this.playerManager.remove(guild.id);
    });
    this.onAsync('voiceStateUpdate', (oldState, newState) => handleVoiceStateUpdate(oldState, newState));
  }

  private loadCommands(): void {
    for (const command of container.getAll<Command>(TYPES.Command)) {
      try {
        command.slashCommand.toJSON();
      } catch (error) {
        debug(error);
        throw new Error(`Could not serialize /${command.slashCommand.name ?? ''} to JSON`);
      }

      if (command.slashCommand.name) {
        this.commandsByName.set(command.slashCommand.name, command);
      }

      if (command.handledButtonIds) {
        for (const buttonId of command.handledButtonIds) {
          this.commandsByButtonId.set(buttonId, command);
        }
      }
    }
  }

  private onAsync<K extends keyof ClientEvents>(event: K, handler: (...args: ClientEvents[K]) => void | Promise<void>): void {
    this.client.on(event, (...args) => {
      void Promise.resolve(handler(...args)).catch(error => {
        this.logUnhandledError(`client.${String(event)}`, error);
      });
    });
  }

  private onceAsync<K extends keyof ClientEvents>(event: K, handler: (...args: ClientEvents[K]) => void | Promise<void>): void {
    this.client.once(event, (...args) => {
      void Promise.resolve(handler(...args)).catch(error => {
        this.logUnhandledError(`client.once.${String(event)}`, error);
      });
    });
  }

  private logUnhandledError(context: string, error: unknown): void {
    const normalizedError = this.normalizeError(error);
    debug(`${context}: ${normalizedError.stack ?? normalizedError.message}`);
  }

  private async onReady(spinner: Ora): Promise<void> {
    const user = this.client.user;
    if (!user) {
      throw new Error('Discord client is ready without a user instance');
    }

    debug(generateDependencyReport());

    const rest = new REST({version: DISCORD_API_VERSION}).setToken(this.config.DISCORD_TOKEN);
    if (this.shouldRegisterCommandsOnBot) {
      spinner.text = '📡 updating commands on bot...';
      await rest.put(
        applicationCommandsRoute(user.id),
        {body: this.commandsByName.map(command => command.slashCommand.toJSON())},
      );
    } else {
      spinner.text = '📡 updating commands in all guilds...';

      await Promise.all([
        ...this.client.guilds.cache.map(async guild => {
          await registerCommandsOnGuild({
            rest,
            guildId: guild.id,
            applicationId: user.id,
            commands: this.commandsByName.map(c => c.slashCommand),
          });
        }),
        rest.put(applicationCommandsRoute(user.id), {body: []}),
      ]);
    }

    user.setPresence({
      activities: [
        {
          name: this.config.BOT_ACTIVITY,
          type: this.config.BOT_ACTIVITY_TYPE,
          url: this.config.BOT_ACTIVITY_URL === '' ? undefined : this.config.BOT_ACTIVITY_URL,
        },
      ],
      status: this.config.BOT_STATUS,
    });

    spinner.succeed(`Ready! Invite the bot with https://discordapp.com/oauth2/authorize?client_id=${user.id}&scope=bot%20applications.commands&permissions=${BOT_REQUIRED_PERMISSIONS}`);
  }

  /**
   * Handles incoming Discord interactions (commands, buttons, autocomplete)
   * @param interaction - The Discord interaction to handle
   */
  private async handleInteraction(interaction: Interaction): Promise<void> {
    try {
      if (interaction.isChatInputCommand()) {
        await this.handleCommandInteraction(interaction);
      } else if (interaction.isButton()) {
        await this.handleButtonInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        await this.handleModalSubmitInteraction(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await this.handleSelectMenuInteraction(interaction);
      } else if (interaction.isAutocomplete()) {
        await this.handleAutocompleteInteraction(interaction);
      }
    } catch (error: unknown) {
      await this.handleInteractionError(interaction, error);
    }
  }

  /**
   * Handles command interactions
   * @param interaction - The command interaction to handle
   */
  private async handleCommandInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = this.commandsByName.get(interaction.commandName);

    if (!command) {
      return;
    }

    if (!interaction.guild) {
      await interaction.reply(errorMsg('you can\'t use this bot in a DM'));
      return;
    }

    const requiresVC = typeof command.requiresVC === 'function' ? command.requiresVC(interaction) : command.requiresVC;
    if (requiresVC && !isUserInVoice(interaction.guild, interaction.user)) {
      await interaction.reply({content: errorMsg('You must be in a voice channel'), ephemeral: true});
      return;
    }

    if (command.execute) {
      await command.execute(interaction);
    }
  }

  /**
   * Handles button interactions
   * @param interaction - The button interaction to handle
   */
  private async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    const command = this.commandsByButtonId.get(interaction.customId);

    if (!command) {
      return;
    }

    if (command.handleButtonInteraction) {
      await command.handleButtonInteraction(interaction);
    }
  }

  /**
   * Handles autocomplete interactions
   * @param interaction - The autocomplete interaction to handle
   */
  private async handleAutocompleteInteraction(interaction: AutocompleteInteraction): Promise<void> {
    const command = this.commandsByName.get(interaction.commandName);

    if (!command) {
      return;
    }

    if (command.handleAutocompleteInteraction) {
      await command.handleAutocompleteInteraction(interaction);
    }
  }

  /**
   * Handles select menu interactions
   * @param interaction - The select menu interaction to handle
   */
  private async handleSelectMenuInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
    const command = this.commandsByButtonId.get(interaction.customId);

    if (!command) {
      return;
    }

    if (command.handleSelectMenuInteraction) {
      await command.handleSelectMenuInteraction(interaction);
    }
  }

  /**
   * Handles modal submit interactions
   * @param interaction - The modal submit interaction to handle
   */
  private async handleModalSubmitInteraction(interaction: ModalSubmitInteraction): Promise<void> {
    const command = this.commandsByButtonId.get(interaction.customId);

    if (!command) {
      return;
    }

    if (command.handleModalSubmit) {
      await command.handleModalSubmit(interaction);
    }
  }

  /**
   * Handles errors that occur during interaction processing
   * @param interaction - The interaction that caused the error
   * @param error - The error that occurred
   */
  private async handleInteractionError(interaction: Interaction, error: unknown): Promise<void> {
    const normalizedError = this.normalizeError(error);
    debug(normalizedError);

    // This can fail if the message was deleted, and we don't want to crash the whole bot
    try {
      const supportsReply = interaction.isChatInputCommand() || interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit();
      const canEdit = supportsReply && (interaction.replied || interaction.deferred);

      if (canEdit) {
        await interaction.editReply(errorMsg(normalizedError));
      } else if (supportsReply) {
        await interaction.reply({content: errorMsg(normalizedError), ephemeral: true});
      }
    } catch {
      // Silently fail if we can't send error message (e.g., message was deleted)
    }
  }

  /**
   * Normalizes an unknown error to an Error object
   * @param error - The error to normalize
   * @returns An Error object
   */
  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    if (typeof error === 'string') {
      return new Error(error);
    }
    return new Error('Unknown error occurred');
  }
}
