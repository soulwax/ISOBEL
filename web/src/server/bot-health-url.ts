const DEFAULT_BOT_HEALTH_HOST = '127.0.0.1';
const DEFAULT_BOT_HEALTH_PORT = '3002';

export function normalizeBotHealthUrl(value: string): string {
  const trimmedUrl = value.trim();

  if (trimmedUrl.endsWith('/health')) {
    return trimmedUrl;
  }

  return trimmedUrl.endsWith('/')
    ? `${trimmedUrl}health`
    : `${trimmedUrl}/health`;
}

export function getBotHealthUrl(): string {
  const configuredUrl = process.env.BOT_HEALTH_URL?.trim();

  if (configuredUrl) {
    return normalizeBotHealthUrl(configuredUrl);
  }

  const port = process.env.HEALTH_PORT?.trim() || DEFAULT_BOT_HEALTH_PORT;
  return `http://${DEFAULT_BOT_HEALTH_HOST}:${port}/health`;
}
