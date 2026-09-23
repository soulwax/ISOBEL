// File: web/src/lib/discord-invite.ts

// Keep in sync with BOT_REQUIRED_PERMISSIONS in src/bot.ts.
const BOT_REQUIRED_PERMISSIONS = '36700160';
const BOT_SCOPES = 'bot applications.commands';

function buildInviteUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: BOT_REQUIRED_PERMISSIONS,
    scope: BOT_SCOPES,
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID?.trim();

// Null when VITE_DISCORD_CLIENT_ID is missing at build time: Discord rejects an
// authorize URL without a client_id with "Invalid Form Body", so the caller
// hides the invite link instead of shipping one that always errors.
export const DISCORD_INVITE_URL = clientId ? buildInviteUrl(clientId) : null;
