// File: web/src/App.tsx

import {
  HiOutlineCode,
  HiOutlineExternalLink,
  HiOutlineFastForward,
  HiOutlineMusicNote,
  HiOutlineSave,
  HiOutlineSpeakerphone,
  HiOutlineStop,
  HiOutlineVideoCamera,
  HiOutlineVolumeUp,
  HiOutlinePlay,
  HiOutlineLink,
  HiOutlineCollection,
} from "react-icons/hi";
import { useState } from "react";
import "./App.css";
import HealthIndicator from "./components/HealthIndicator";
import DiscordLogin from "./components/DiscordLogin";
import DiscordGuildsSidebar from "./components/DiscordGuildsSidebar";
import GuildSettings from "./components/GuildSettings";
import { useAuth } from "./hooks/useAuth";
import type { DiscordGuild } from "./types/discord";

function App() {
  const [selectedGuild, setSelectedGuild] = useState<DiscordGuild | null>(null);
  const { isAuthenticated } = useAuth();
  const activeSelectedGuild = isAuthenticated ? selectedGuild : null;
  const helpSections = [
    {
      title: "Getting Started",
      icon: <HiOutlinePlay />,
      commands: [
        "/play query:<song or URL>",
        "/queue",
        "/now-playing",
        "/help",
      ],
    },
    {
      title: "Playback",
      icon: <HiOutlineFastForward />,
      commands: [
        "/pause, /resume, /skip, /stop",
        "/next, /replay, /unskip",
        "/volume level:<0-100>",
        "/disconnect",
      ],
    },
    {
      title: "Queue Tools",
      icon: <HiOutlineCollection />,
      commands: [
        "/move from:<n> to:<n>",
        "/remove position:<n> or range:<a-b>",
        "/shuffle, /loop, /loop-queue",
        "/seek time:<m:ss>, /fseek time:<m:ss>",
      ],
    },
    {
      title: "Library & Shortcuts",
      icon: <HiOutlineLink />,
      commands: [
        "/favorites create|use|list|remove",
        "/yt query:<text>",
        "/file file:<upload>",
        "/playback-controls",
      ],
    },
    {
      title: "Server Settings",
      icon: <HiOutlineCode />,
      commands: [
        "/config get",
        "/config set-default-volume",
        "/config set-default-queue-page-size",
        "/config set-playlist-limit",
      ],
    },
  ];

  const handleGuildSelect = (guild: DiscordGuild) => {
    setSelectedGuild(guild);
  };

  const handleBack = () => {
    setSelectedGuild(null);
  };

  return (
    <div className={`app ${isAuthenticated ? 'app-with-sidebar' : ''}`}>
      {isAuthenticated && (
        <DiscordGuildsSidebar 
          onGuildSelect={handleGuildSelect}
          selectedGuildId={activeSelectedGuild?.id}
        />
      )}
      {activeSelectedGuild ? (
        <GuildSettings guild={activeSelectedGuild} onBack={handleBack} />
      ) : (
        <>
      <nav className="nav">
        <div className="nav-container">
          <div className="logo">
            <HiOutlineSpeakerphone className="logo-icon" />
            <span className="logo-text">ISOBEL / (formerly ECHO)</span>
          </div>
          <div className="nav-links">
            <HealthIndicator />
            <a href="#features">Features</a>
            <a href="#help">Help</a>
            <a href="#setup">Setup</a>
            <a href="#about">About</a>
            <a
              href="https://songbirdapi.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              API
            </a>
            <a
              href="https://github.com/soulwax/ISOBEL"
              target="_blank"
              rel="noopener noreferrer"
              className="github-link"
            >
              GitHub
            </a>
            <DiscordLogin />
          </div>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-bottom">
            <div className="hero-content">
              <div className="hero-title-section">
                <img
                  src="/songbird.png"
                  alt="ISOBEL Songbird"
                  className="songbird-img"
                />
                <h1 className="hero-title">
                  A Discord Music Bot
                  <span className="highlight"> That Doesn't Suck</span>
                </h1>
              </div>
              <p className="hero-subtitle">
                High-quality audio streaming, smart caching, overall imo, a good
                experience 10/10. Better than the majority of the other discord
                music bots but with fewer features yet. Made with love, as is
                the songbird api that enables the bot's capabilities.
              </p>
              <div className="hero-buttons">
                <a
                  href="https://discord.com/oauth2/authorize"
                  className="btn btn-primary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Add to Discord
                </a>
                <a
                  href="https://github.com/soulwax/ISOBEL"
                  className="btn btn-secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on GitHub
                </a>
              </div>
            </div>
            <div className="hero-visual">
              <div className="discord-mockup">
                <div className="mockup-header">
                  <div className="mockup-dot"></div>
                  <div className="mockup-dot"></div>
                  <div className="mockup-dot"></div>
                </div>
                <div className="mockup-content">
                  <div className="mockup-message">
                    <div className="mockup-avatar"></div>
                    <div className="mockup-text">
                      <span className="mockup-username">ISOBEL</span>
                      <span className="mockup-time">Today at 2:30 PM</span>
                    </div>
                  </div>
                  <div className="mockup-embed">
                    <div className="embed-content">
                      <div className="embed-title">
                        <HiOutlineMusicNote className="inline-icon" /> Now
                        Playing
                      </div>
                      <div className="embed-description">
                        High-quality audio streaming
                      </div>
                      <div className="embed-progress">
                        <div className="progress-bar"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="features">
          <div className="container">
            <h2 className="section-title">Powerful Features</h2>
            <p className="section-subtitle">
              Everything you need for the perfect music experience
            </p>
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">
                  <HiOutlineMusicNote />
                </div>
                <h3 className="feature-title">High-Quality Audio</h3>
                <p className="feature-description">
                  320kbps MP3 source with 192kbps Opus output for crystal-clear
                  sound
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <HiOutlineStop />
                </div>
                <h3 className="feature-title">Animated Progress Bar</h3>
                <p className="feature-description">
                  Real-time updating progress bar in discord embed lmao
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <HiOutlineVideoCamera />
                </div>
                <h3 className="feature-title">Livestream Support</h3>
                <p className="feature-description">
                  Stream HLS live audio feeds
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <HiOutlineFastForward />
                </div>
                <h3 className="feature-title">Seeking</h3>
                <p className="feature-description">
                  Seek to any position within a song instantly
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <HiOutlineSave />
                </div>
                <h3 className="feature-title">Advanced Caching</h3>
                <p className="feature-description">
                  Local MP3 caching for instant playback and better performance
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <HiOutlineVolumeUp />
                </div>
                <h3 className="feature-title">Volume Management</h3>
                <p className="feature-description">
                  Normalizes volume across tracks with automatic ducking when
                  people speak
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <HiOutlineExternalLink />
                </div>
                <h3 className="feature-title">Custom Shortcuts</h3>
                <p className="feature-description">
                  Users can add custom shortcuts (aliases) for quick access
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <HiOutlineMusicNote />
                </div>
                <h3 className="feature-title">Starchild Music API</h3>
                <p className="feature-description">
                  Streams directly from the Starchild Music API - no YouTube or
                  Spotify required
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <HiOutlineCode />
                </div>
                <h3 className="feature-title">TypeScript</h3>
                <p className="feature-description">
                  Written in TypeScript with full type safety, easily extendable
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <HiOutlinePlay />
                </div>
                <h3 className="feature-title">Direct MP3 Playback</h3>
                <p className="feature-description">
                  Play MP3 files directly when selected, bypassing unnecessary processing for optimal performance
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <HiOutlineLink />
                </div>
                <h3 className="feature-title">YouTube URL Support</h3>
                <p className="feature-description">
                  Simply paste YouTube URLs to instantly queue and play your favorite tracks
                </p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <HiOutlineCollection />
                </div>
                <h3 className="feature-title">Smart Queue Management</h3>
                <p className="feature-description">
                  Intelligent queue system with shuffle, repeat, and priority controls for seamless playback
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="about">
          <div className="container">
            <h2 className="section-title">Self-Hosted & Open Source</h2>
            <p className="section-subtitle">
              Take control of your music bot experience
            </p>
            <div className="about-content">
              <div className="about-text">
                <p>
                  ISOBEL (formerly ECHO) is a highly-opinionated, self-hosted Discord music bot
                  designed for small to medium-sized Discord servers. It's built
                  with TypeScript and focuses on providing a seamless,
                  high-quality music experience without the bloat.
                </p>
                <p>
                  With advanced caching, smart volume management, and support
                  for livestreams, ISOBEL delivers everything you need for your
                  community's music needs.
                </p>
                <div className="about-stats">
                  <div className="stat">
                    <div className="stat-number">320kbps</div>
                    <div className="stat-label">Audio Quality</div>
                  </div>
                  <div className="stat">
                    <div className="stat-number">2GB+</div>
                    <div className="stat-label">Cache Support</div>
                  </div>
                  <div className="stat">
                    <div className="stat-number">100%</div>
                    <div className="stat-label">Open Source</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="help" className="help">
          <div className="container">
            <h2 className="section-title">Help & Commands</h2>
            <p className="section-subtitle">
              Run <code>/help</code> in Discord for the embed, or use this quick reference.
            </p>
            <div className="help-grid">
              {helpSections.map((section) => (
                <article key={section.title} className="help-card">
                  <div className="help-card-header">
                    <div className="help-card-icon">{section.icon}</div>
                    <h3 className="help-card-title">{section.title}</h3>
                  </div>
                  <ul className="help-command-list">
                    {section.commands.map((command) => (
                      <li key={command}>
                        <code className="help-command">{command}</code>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <p className="help-note">
              Most playback commands require you to be in a voice channel.
            </p>
          </div>
        </section>

        <section id="setup" className="setup">
          <div className="container">
            <h2 className="section-title">Setup Your Own ISOBEL</h2>
            <p className="section-subtitle">
              Run your own bot instance with local control over settings, data, and uptime.
            </p>
            <div className="setup-grid">
              <article className="setup-card">
                <h3 className="setup-card-title">Prerequisites</h3>
                <ul className="setup-list">
                  <li>Node.js 24+ and npm</li>
                  <li>PostgreSQL database (local or managed)</li>
                  <li>Discord Bot Token and OAuth app credentials</li>
                  <li>ffmpeg/ffprobe available on your server</li>
                </ul>
              </article>
              <article className="setup-card">
                <h3 className="setup-card-title">Quick Start</h3>
                <pre className="setup-code">
                  <code>{`git clone --recursive git@github.com:soulwax/isobel.git
cd isobel
cp .env.example .env
npm install
npm run build
cd web && npm install && npm run build && cd ..
npm run start:all:prod`}</code>
                </pre>
              </article>
              <article className="setup-card">
                <h3 className="setup-card-title">After Startup</h3>
                <ul className="setup-list">
                  <li>Verify bot health: <code>curl http://localhost:3002/health</code></li>
                  <li>Verify web health: <code>curl http://localhost:3001/health</code></li>
                  <li>Open the dashboard and sign in with Discord</li>
                  <li>Run <code>/help</code> in Discord to confirm command sync</li>
                </ul>
              </article>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-logo">
              <HiOutlineSpeakerphone className="logo-icon" />
              <span className="logo-text">ISOBEL</span>
            </div>
            <div className="footer-links">
              <a
                href="https://github.com/soulwax/ISOBEL"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
              <a
                href="https://github.com/soulwax/ISOBEL/blob/master/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
              >
                License
              </a>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© {new Date().getFullYear()} ISOBEL. Licensed under GPLv3.</p>
          </div>
        </div>
      </footer>
        </>
      )}
    </div>
  );
}

export default App;
