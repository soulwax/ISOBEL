// File: web/src/lib/validation.ts

import { z } from 'zod';

/**
 * Zod schema for guild settings validation
 */
export const guildSettingsSchema = z.object({
  playlistLimit: z.number().int().min(1).max(200).optional(),
  secondsToWaitAfterQueueEmpties: z.number().int().min(0).max(300).optional(),
  leaveIfNoListeners: z.boolean().optional(),
  queueAddResponseEphemeral: z.boolean().optional(),
  autoAnnounceNextSong: z.boolean().optional(),
  defaultVolume: z.number().int().min(0).max(100).optional(),
  defaultQueuePageSize: z.number().int().min(1).max(30).optional(),
  turnDownVolumeWhenPeopleSpeak: z.boolean().optional(),
  turnDownVolumeWhenPeopleSpeakTarget: z.number().int().min(0).max(100).optional(),
}).strict(); // Reject unknown fields

export type GuildSettingsInput = z.infer<typeof guildSettingsSchema>;
