// File: web/src/components/HealthIndicator.tsx

import { useEffect, useState } from 'react';
import { HiCheckCircle, HiXCircle } from 'react-icons/hi';
import './HealthIndicator.css';

interface HealthStatus {
  status: 'ok' | 'not_ready' | 'error';
  ready: boolean;
  guilds?: number;
  uptime?: number;
  uptimeFormatted?: string;
  timestamp?: string;
}

const PROXIED_HEALTH_ENDPOINT = '/api/bot-health';

function normalizeBotHealthUrl(value: string): string {
  const trimmedUrl = value.trim();

  if (trimmedUrl.endsWith('/health')) {
    return trimmedUrl;
  }

  return trimmedUrl.endsWith('/')
    ? `${trimmedUrl}health`
    : `${trimmedUrl}/health`;
}

function getHealthUrls(): string[] {
  const urls = [PROXIED_HEALTH_ENDPOINT];
  const directHealthUrl = import.meta.env.VITE_BOT_HEALTH_URL;

  if (directHealthUrl) {
    urls.push(normalizeBotHealthUrl(directHealthUrl));
  }

  return [...new Set(urls)];
}

export default function HealthIndicator() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkHealth = async () => {
    const healthUrls = getHealthUrls();
    let lastError: Error | null = null;

    for (const healthUrl of healthUrls) {
      try {
        const response = await fetch(healthUrl, { cache: 'no-store' });
        const responseText = await response.text();

        let data: HealthStatus | null = null;
        if (responseText !== '') {
          try {
            data = JSON.parse(responseText) as HealthStatus;
          } catch (error) {
            console.error(`Health check returned invalid JSON from ${healthUrl}`, error, responseText);
          }
        }

        if (!response.ok) {
          if (data?.status === 'not_ready') {
            setHealth(data);
            setIsLoading(false);
            return;
          }

          console.error(`Health check failed: ${response.status} ${response.statusText}`, responseText);
          throw new Error(`Health check failed with status ${response.status}`);
        }

        if (!data) {
          throw new Error('Health check returned an empty response');
        }

        setHealth(data);
        setIsLoading(false);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Health check error for ${healthUrl}:`, error);
      }
    }

    if (lastError) {
      console.error('All health checks failed', lastError);
    }

    setHealth({
      status: 'error',
      ready: false,
    });
    setIsLoading(false);
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="health-indicator loading">
        <div className="health-dot pulsing"></div>
        <span className="health-text">Checking status...</span>
      </div>
    );
  }

  if (!health || health.status === 'error') {
    return (
      <div className="health-indicator offline">
        <HiXCircle className="health-icon" />
        <div className="health-info">
          <span className="health-text">Offline</span>
          <span className="health-subtext">Bot is not responding</span>
        </div>
      </div>
    );
  }

  if (health.status === 'ok' && health.ready) {
    return (
      <div className="health-indicator online">
        <HiCheckCircle className="health-icon" />
        <div className="health-info">
          <span className="health-text">Online</span>
          <span className="health-subtext">
            {health.guilds !== undefined && `${health.guilds} server${health.guilds !== 1 ? 's' : ''}`}
            {health.uptimeFormatted && ` • Uptime: ${health.uptimeFormatted}`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="health-indicator starting">
      <div className="health-dot pulsing"></div>
      <div className="health-info">
        <span className="health-text">Starting</span>
        <span className="health-subtext">Bot is initializing</span>
      </div>
    </div>
  );
}
