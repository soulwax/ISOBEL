// File: web/src/types/discord.ts

export interface DiscordUser {
  id: string;
  name?: string;
  email?: string;
  image?: string;
  discordId?: string;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  permissions?: string | null;
}

export interface GuildSettingsData {
  guildId: string;
  playlistLimit: number;
  secondsToWaitAfterQueueEmpties: number;
  leaveIfNoListeners: boolean;
  queueAddResponseEphemeral: boolean;
  autoAnnounceNextSong: boolean;
  defaultVolume: number;
  defaultQueuePageSize: number;
  turnDownVolumeWhenPeopleSpeak: boolean;
  turnDownVolumeWhenPeopleSpeakTarget: number;
}

export interface AppSession {
  user?: DiscordUser;
  expires?: string;
}
