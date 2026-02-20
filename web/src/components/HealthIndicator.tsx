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

export default function HealthIndicator() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkHealth = async () => {
    try {
      // Call the bot health endpoint directly (CORS is now enabled on the bot side)
      const botHealthUrl = import.meta.env.VITE_BOT_HEALTH_URL || 'https://isobelhealth.soulwax.dev';
      const trimmedUrl = botHealthUrl.trim();
      const healthUrl = trimmedUrl.endsWith('/health')
        ? trimmedUrl
        : trimmedUrl.endsWith('/')
          ? `${trimmedUrl}health`
          : `${trimmedUrl}/health`;
      
      // Simple GET request - no headers or credentials needed, avoids OPTIONS preflight
      const response = await fetch(healthUrl);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Health check failed: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Health check failed with status ${response.status}`);
      }
      
      const data = await response.json();
      setHealth(data);
      setIsLoading(false);
    } catch (error) {
      console.error('Health check error:', error);
      setHealth({
        status: 'error',
        ready: false,
      });
      setIsLoading(false);
    }
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
