// File: web/src/lib/utils.ts

/**
 * Utility functions for security, validation, and common operations
 */

/**
 * Escape HTML to prevent XSS attacks
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Validate Discord ID format (17-19 digit numbers)
 */
export function validateDiscordId(id: string): boolean {
  return /^\d{17,19}$/.test(id);
}

/**
 * Validate guild ID format
 */
export function validateGuildId(guildId: string): boolean {
  return validateDiscordId(guildId);
}

/**
 * Check if user has MANAGE_GUILD permission
 * MANAGE_GUILD = 0x20 (32 in decimal)
 */
export function hasManageGuildPermission(permissions: string | null): boolean {
  if (!permissions) return false;
  try {
    const perms = BigInt(permissions);
    const MANAGE_GUILD = BigInt(0x20);
    return (perms & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

/**
 * Check if user has ADMINISTRATOR permission
 * ADMINISTRATOR = 0x8 (8 in decimal)
 */
export function hasAdministratorPermission(permissions: string | null): boolean {
  if (!permissions) return false;
  try {
    const perms = BigInt(permissions);
    const ADMINISTRATOR = BigInt(0x8);
    return (perms & ADMINISTRATOR) === ADMINISTRATOR;
  } catch {
    return false;
  }
}

/**
 * Check if user can manage guild settings
 * Requires either MANAGE_GUILD or ADMINISTRATOR permission
 */
export function canManageGuildSettings(permissions: string | null): boolean {
  return hasManageGuildPermission(permissions) || hasAdministratorPermission(permissions);
}
