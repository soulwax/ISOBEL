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
} from "react-icons/hi";
import { useState } from "react";
import "./App.css";
import HealthIndicator from "./components/HealthIndicator";
import DiscordLogin from "./components/DiscordLogin";
import DiscordGuildsSidebar from "./components/DiscordGuildsSidebar";
import GuildSettings from "./components/GuildSettings";
import { useAuth } from "./hooks/useAuth";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

function App() {
  const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
  const { isAuthenticated } = useAuth();

  const handleGuildSelect = (guild: Guild) => {
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
          selectedGuildId={selectedGuild?.id}
        />
      )}
      {selectedGuild ? (
        <GuildSettings guild={selectedGuild} onBack={handleBack} />
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
