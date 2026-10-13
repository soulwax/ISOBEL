// File: web/src/components/PipelineArchitecture.tsx

import "./PipelineArchitecture.css";

/**
 * Long-form walkthrough of the bot's audio pipeline, rendered at /architecture.
 * Every figure is hand-drawn inline SVG; the numbers and file references mirror
 * src/services/player.ts and src/utils/constants.ts in the bot, so update this
 * page alongside them.
 */
export default function PipelineArchitecture() {
  return (
    <main className="arch">
      <div className="arch-wrap">
        <header>
          <div className="arch-eyebrow">ISOBEL · bot internals · src/services/player.ts</div>
          <h1>How a song gets from Songbird to the voice channel</h1>
          <p className="lede">The bot pulls a 320 kbps MP3 from the Songbird API and encodes it to Opus once, then reuses that Opus file. This page follows a song from the <code>/play</code> command to the Discord voice channel. It covers which of the five playback paths is chosen and why, the exact ffmpeg commands, how volume and ducking work, how failures are retried, and how the file cache fills up and empties.</p>
        </header>

        <nav aria-label="Sections">
          <ol>
            <li><a href="#map"><span className="n">1</span>System map</a></li>
            <li><a href="#play"><span className="n">2</span>/play to queue</a></li>
            <li><a href="#decide"><span className="n">3</span>Path decision</a></li>
            <li><a href="#paths"><span className="n">4</span>Five paths</a></li>
            <li><a href="#ffmpeg"><span className="n">5</span>ffmpeg commands</a></li>
            <li><a href="#states"><span className="n">6</span>Player states</a></li>
            <li><a href="#volume"><span className="n">7</span>Volume and ducking</a></li>
            <li><a href="#cache"><span className="n">8</span>File cache</a></li>
            <li><a href="#failures"><span className="n">9</span>Failures</a></li>
            <li><a href="#telemetry"><span className="n">10</span>Telemetry</a></li>
            <li><a href="#numbers"><span className="n">11</span>Numbers and files</a></li>
          </ol>
        </nav>

        {/* 1 */}
        <section id="map">
          <h2><span className="n">01</span>System map</h2>
          <p>All playback state belongs to one <code>Player</code> object per guild. <code>PlayerManager</code> creates these on demand and keeps them in a map keyed by guild ID. Commands and Discord events only ever call methods on a Player. The Player owns the ffmpeg processes, the discord.js audio player and the voice connection.</p>
          <figure>
            <div className="scroll">
              <svg viewBox="0 0 1040 400" role="img" aria-label="System map. Discord gateway events reach the commands and the voiceStateUpdate handler, which call into the per-guild Player that PlayerManager owns. The Player streams MP3 from the Songbird API, asks SongbirdNext for recommendations, reads and writes the FileCache, records plays in PlaybackHistory, and exposes snapshots to the HealthServer. It sends Opus packets to Discord voice.">
                <defs>
                  <marker id="m1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" className="head"/></marker>
                </defs>
                {/* left: Discord */}
                <rect className="box-ext" x="20" y="40" width="150" height="56" rx="4"/>
                <text className="t-name" x="95" y="64" textAnchor="middle">Discord gateway</text>
                <text className="t-sub" x="95" y="81" textAnchor="middle">interactions · voice</text>
                <rect className="box-ext" x="20" y="224" width="150" height="56" rx="4"/>
                <text className="t-name" x="95" y="248" textAnchor="middle">Discord voice</text>
                <text className="t-sub" x="95" y="265" textAnchor="middle">UDP · Opus frames</text>

                {/* middle */}
                <rect className="box" x="230" y="40" width="170" height="56" rx="4"/>
                <text className="t-name" x="315" y="64" textAnchor="middle">Commands</text>
                <text className="t-sub" x="315" y="81" textAnchor="middle">play · seek · volume…</text>
                <rect className="box" x="230" y="112" width="170" height="56" rx="4"/>
                <text className="t-name" x="315" y="136" textAnchor="middle">voiceStateUpdate</text>
                <text className="t-sub" x="315" y="153" textAnchor="middle">leaveIfNoListeners</text>
                <rect className="box" x="230" y="184" width="170" height="56" rx="4"/>
                <text className="t-name" x="315" y="208" textAnchor="middle">PlayerManager</text>
                <text className="t-sub" x="315" y="225" textAnchor="middle">guildId → Player</text>

                <line className="edge" x1="170" y1="68" x2="228" y2="68" markerEnd="url(#m1)"/>
                <text className="t-edge" x="199" y="60" textAnchor="middle">events</text>
                <path className="edge" d="M95 96 V140 H228" markerEnd="url(#m1)"/>
                <text className="t-edge" x="103" y="124">voice state</text>

                {/* Player group */}
                <rect className="box-group" x="460" y="40" width="250" height="300" rx="6"/>
                <text className="t-name" x="585" y="63" textAnchor="middle">Player · one per guild</text>
                <rect className="box" x="478" y="76" width="214" height="40" rx="4"/>
                <text className="t-sub" x="585" y="100" textAnchor="middle">queue · position · loop modes</text>
                <rect className="box" x="478" y="128" width="214" height="40" rx="4"/>
                <text className="t-sub" x="585" y="152" textAnchor="middle">getStream() → ffmpeg child</text>
                <rect className="box" x="478" y="180" width="214" height="40" rx="4"/>
                <text className="t-sub" x="585" y="204" textAnchor="middle">AudioPlayer (@discordjs/voice)</text>
                <rect className="box" x="478" y="232" width="214" height="40" rx="4"/>
                <text className="t-sub" x="585" y="256" textAnchor="middle">VoiceConnection</text>
                <rect className="box" x="478" y="284" width="214" height="40" rx="4"/>
                <text className="t-sub" x="585" y="308" textAnchor="middle">telemetry · embed timers</text>
                <line className="edge" x1="585" y1="168" x2="585" y2="178" markerEnd="url(#m1)"/>
                <line className="edge" x1="585" y1="220" x2="585" y2="230" markerEnd="url(#m1)"/>

                <line className="edge" x1="400" y1="68" x2="458" y2="68" markerEnd="url(#m1)"/>
                <text className="t-edge" x="429" y="60" textAnchor="middle">calls</text>
                <line className="edge" x1="400" y1="140" x2="458" y2="140" markerEnd="url(#m1)"/>
                <text className="t-edge" x="429" y="132" textAnchor="middle">leave</text>
                <line className="edge" x1="400" y1="212" x2="458" y2="212" markerEnd="url(#m1)"/>
                <text className="t-edge" x="429" y="204" textAnchor="middle">owns</text>
                <line className="edge" x1="476" y1="252" x2="172" y2="252" markerEnd="url(#m1)"/>
                <text className="t-edge" x="318" y="270" textAnchor="middle">Opus, one frame per 20 ms</text>

                {/* right column */}
                <rect className="box-ext" x="780" y="40" width="240" height="56" rx="4"/>
                <text className="t-name" x="900" y="64" textAnchor="middle">Songbird API</text>
                <text className="t-sub" x="900" y="81" textAnchor="middle">music/stream/direct · 320k</text>
                <rect className="box-ext" x="780" y="112" width="240" height="56" rx="4"/>
                <text className="t-name" x="900" y="136" textAnchor="middle">SongbirdNext</text>
                <text className="t-sub" x="900" y="153" textAnchor="middle">recommendations, optional</text>
                <rect className="box" x="780" y="184" width="240" height="56" rx="4"/>
                <text className="t-name" x="900" y="208" textAnchor="middle">FileCache</text>
                <text className="t-sub" x="900" y="225" textAnchor="middle">CACHE_DIR + FileCache table</text>
                <rect className="box" x="780" y="256" width="240" height="56" rx="4"/>
                <text className="t-name" x="900" y="280" textAnchor="middle">PlaybackHistory</text>
                <text className="t-sub" x="900" y="297" textAnchor="middle">SongPlay · PlaybackAction</text>
                <rect className="box" x="780" y="328" width="240" height="56" rx="4"/>
                <text className="t-name" x="900" y="352" textAnchor="middle">HealthServer :3002</text>
                <text className="t-sub" x="900" y="369" textAnchor="middle">GET /health</text>

                <line className="edge" x1="710" y1="68" x2="778" y2="68" markerEnd="url(#m1)"/>
                <text className="t-edge" x="744" y="60" textAnchor="middle">MP3</text>
                <line className="edge" x1="710" y1="140" x2="778" y2="140" markerEnd="url(#m1)"/>
                <text className="t-edge" x="744" y="132" textAnchor="middle">new song</text>
                <line className="edge" x1="712" y1="212" x2="778" y2="212" markerStart="url(#m1)" markerEnd="url(#m1)"/>
                <text className="t-edge" x="744" y="204" textAnchor="middle">files</text>
                <line className="edge" x1="710" y1="284" x2="778" y2="284" markerEnd="url(#m1)"/>
                <text className="t-edge" x="744" y="276" textAnchor="middle">plays</text>
                <path className="edge" d="M710 330 H744 V356 H778" markerEnd="url(#m1)"/>
                <text className="t-edge" x="718" y="352" textAnchor="end">snapshot</text>
              </svg>
            </div>
            <figcaption>Dashed boxes are outside the bot process. Settings such as default volume, ducking, loop mode and the idle timeout are read from the Postgres <code>Setting</code> row through <code>getGuildSettings()</code>. They are read when the bot connects, at the start of each track, and when the queue ends.</figcaption>
          </figure>
        </section>

        {/* 2 */}
        <section id="play">
          <h2><span className="n">02</span>From /play to a queued song</h2>
          <p><code>AddQueryToQueue</code> joins the voice channel and resolves the query at the same time, so a cold start doesn't wait for one before starting the other. <code>/play</code> asks <code>GetSongs</code> for exactly one result.</p>
          <figure>
            <div className="scroll">
              <svg viewBox="0 0 1040 400" role="img" aria-label="A /play query or an mp3 attachment reaches AddQueryToQueue. It connects to voice and calls GetSongs in parallel. GetSongs routes track IDs to getTrackById, public URLs to an HLS probe raced against a search, YouTube URLs to a title search with YouTube fallback, and everything else to a Songbird search. The songs are trimmed to maxQueueSize, added to the player, playback starts if needed, and the now-playing embed is posted.">
                <defs>
                  <marker id="m2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="head"/></marker>
                </defs>
                <rect className="box-ext" x="20" y="34" width="140" height="56" rx="4"/>
                <text className="t-name" x="90" y="58" textAnchor="middle">/play query</text>
                <text className="t-sub" x="90" y="75" textAnchor="middle">or autocomplete</text>
                <rect className="box-ext" x="20" y="130" width="140" height="56" rx="4"/>
                <text className="t-name" x="90" y="154" textAnchor="middle">/file</text>
                <text className="t-sub" x="90" y="171" textAnchor="middle">.mp3 attachment</text>

                <rect className="box" x="210" y="34" width="180" height="56" rx="4"/>
                <text className="t-name" x="300" y="58" textAnchor="middle">AddQueryToQueue</text>
                <text className="t-sub" x="300" y="75" textAnchor="middle">defer reply · settings</text>

                <line className="edge" x1="160" y1="56" x2="208" y2="56" markerEnd="url(#m2)"/>
                <text className="t-edge" x="184" y="48" textAnchor="middle">query</text>
                <path className="edge" d="M160 158 H185 V78 H208" markerEnd="url(#m2)"/>
                <text className="t-edge" x="168" y="150">file</text>

                <rect className="box" x="450" y="34" width="170" height="56" rx="4"/>
                <text className="t-name" x="535" y="58" textAnchor="middle">GetSongs</text>
                <text className="t-sub" x="535" y="75" textAnchor="middle">limit 1 for /play</text>
                <line className="edge" x1="390" y1="62" x2="448" y2="62" markerEnd="url(#m2)"/>
                <text className="t-edge" x="419" y="54" textAnchor="middle">query</text>

                <rect className="box" x="450" y="130" width="170" height="56" rx="4"/>
                <text className="t-name" x="535" y="154" textAnchor="middle">player.connect()</text>
                <text className="t-sub" x="535" y="171" textAnchor="middle">joins the voice channel</text>
                <path className="edge" d="M300 90 V158 H448" markerEnd="url(#m2)"/>
                <text className="t-edge" x="310" y="150">in parallel</text>

                {/* GetSongs branches */}
                <path className="edge" d="M620 62 H650 V244" />
                <line className="edge" x1="650" y1="62" x2="678" y2="62" markerEnd="url(#m2)"/>
                <line className="edge" x1="650" y1="124" x2="678" y2="124" markerEnd="url(#m2)"/>
                <line className="edge" x1="650" y1="184" x2="678" y2="184" markerEnd="url(#m2)"/>
                <line className="edge" x1="650" y1="244" x2="678" y2="244" markerEnd="url(#m2)"/>

                <rect className="box" x="680" y="38" width="340" height="48" rx="4"/>
                <text className="t-tag" x="694" y="56">track:&lt;id&gt; (from autocomplete)</text>
                <text className="t-name" x="694" y="75">getTrackById · music/tracks/batch</text>
                <rect className="box" x="680" y="100" width="340" height="48" rx="4"/>
                <text className="t-tag" x="694" y="118">public http(s) URL</text>
                <text className="t-name" x="694" y="137">HLS probe (1.5 s) raced against a search</text>
                <rect className="box" x="680" y="160" width="340" height="48" rx="4"/>
                <text className="t-tag" x="694" y="178">YouTube URL</text>
                <text className="t-name" x="694" y="197">title → Songbird search, else YouTube</text>
                <rect className="box" x="680" y="220" width="340" height="48" rx="4"/>
                <text className="t-tag" x="694" y="238">anything else</text>
                <text className="t-name" x="694" y="257">StarchildAPI.search</text>

                {/* join */}
                <path className="edge" d="M850 268 V296 H295 V318" markerEnd="url(#m2)"/>
                <line className="edge" x1="535" y1="186" x2="535" y2="296"/>
                <text className="t-edge" x="858" y="288">songs[]</text>
                <text className="t-edge" x="543" y="244">voice ready</text>

                <rect className="box" x="210" y="320" width="170" height="56" rx="4"/>
                <text className="t-name" x="295" y="344" textAnchor="middle">Trim to maxQueueSize</text>
                <text className="t-sub" x="295" y="361" textAnchor="middle">0 means no limit</text>
                <rect className="box" x="440" y="320" width="160" height="56" rx="4"/>
                <text className="t-name" x="520" y="344" textAnchor="middle">player.add()</text>
                <text className="t-sub" x="520" y="361" textAnchor="middle">front if "immediate"</text>
                <rect className="box" x="660" y="320" width="160" height="56" rx="4"/>
                <text className="t-name" x="740" y="344" textAnchor="middle">player.play()</text>
                <text className="t-sub" x="740" y="361" textAnchor="middle">if just joined or IDLE</text>
                <rect className="box" x="880" y="320" width="140" height="56" rx="4"/>
                <text className="t-name" x="950" y="344" textAnchor="middle">Now playing</text>
                <text className="t-sub" x="950" y="361" textAnchor="middle">embed + controls</text>
                <line className="edge" x1="380" y1="348" x2="438" y2="348" markerEnd="url(#m2)"/>
                <line className="edge" x1="600" y1="348" x2="658" y2="348" markerEnd="url(#m2)"/>
                <line className="edge" x1="820" y1="348" x2="878" y2="348" markerEnd="url(#m2)"/>
              </svg>
            </div>
            <figcaption>Searches go through three layers before reaching Songbird: an in-memory cache (10 minutes for searches, 20 for tracks), the Postgres <code>KeyValueCache</code> (1 hour), and single-flight deduplication, so identical searches running at the same time share one HTTP call. URLs that point at private or localhost addresses are treated as plain text searches, which blocks SSRF. Each add also writes a <code>queue</code> or <code>queue-next</code> row to <code>PlaybackAction</code>.</figcaption>
          </figure>
        </section>

        {/* 3 */}
        <section id="decide">
          <h2><span className="n">03</span>How getStream() picks a path</h2>
          <p><code>getStream()</code> runs on every play, seek, resume after a reconnect, and volume change on the passthrough path. It checks these questions in order and stops at the first "yes".</p>
          <figure>
            <div className="scroll">
              <svg viewBox="0 0 1040 570" role="img" aria-label="getStream decision chain. HLS streams and YouTube or attachment sources are encoded from their URL without caching. If a usable Opus file exists, a full-track request reads the file and a seek remuxes it. Otherwise a seek downloads the whole MP3 first and encodes from it. A prefetched or cached MP3 is encoded from disk. If nothing is cached, ffmpeg encodes from the Songbird HTTP stream while the MP3 and Opus files are warmed in the background.">
                <defs>
                  <marker id="m3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="head"/></marker>
                  <marker id="m3h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="head-hot"/></marker>
                </defs>
                <text className="t-head" x="60" y="20">QUESTION</text>
                <text className="t-head" x="470" y="20">WHAT HAPPENS</text>
                <text className="t-head" x="820" y="20">PLAYBACKPATH · INPUT</text>

                {/* Q1 */}
                <rect className="box-q" x="60" y="30" width="300" height="44" rx="4"/>
                <text className="t-name" x="210" y="57" textAnchor="middle">HLS live stream?</text>
                <line className="edge" x1="360" y1="52" x2="468" y2="52" markerEnd="url(#m3)"/>
                <text className="t-yes" x="414" y="45" textAnchor="middle">yes</text>
                <rect className="box" x="470" y="30" width="330" height="44" rx="4"/>
                <text className="t-name" x="484" y="57">Encode from the stream URL, no cache</text>
                <text className="t-tag" x="820" y="48">encode</text>
                <text className="t-sub" x="820" y="64">HTTP · retried</text>

                <line className="edge" x1="210" y1="74" x2="210" y2="108" markerEnd="url(#m3)"/>
                <text className="t-edge" x="218" y="95">no</text>

                {/* Q2 */}
                <rect className="box-q" x="60" y="110" width="300" height="44" rx="4"/>
                <text className="t-name" x="210" y="137" textAnchor="middle">YouTube or Discord attachment?</text>
                <line className="edge" x1="360" y1="132" x2="468" y2="132" markerEnd="url(#m3)"/>
                <text className="t-yes" x="414" y="125" textAnchor="middle">yes</text>
                <rect className="box" x="470" y="110" width="330" height="44" rx="4"/>
                <text className="t-name" x="484" y="137">Encode from the URL with -ss / -to, no cache</text>
                <text className="t-tag" x="820" y="128">encode</text>
                <text className="t-sub" x="820" y="144">HTTP · retried</text>

                <line className="edge" x1="210" y1="154" x2="210" y2="188" markerEnd="url(#m3)"/>
                <text className="t-edge" x="218" y="175">no (Songbird track)</text>

                {/* Q3 */}
                <rect className="box-q" x="60" y="190" width="300" height="44" rx="4"/>
                <text className="t-name" x="210" y="209" textAnchor="middle">Usable Opus file on disk?</text>
                <text className="t-sub" x="210" y="226" textAnchor="middle">no ducking · volume 100% · same kbps</text>
                <line className="edge-hot" x1="360" y1="212" x2="467" y2="212" markerEnd="url(#m3h)"/>
                <text className="t-yes" x="414" y="205" textAnchor="middle">yes</text>
                <rect className="box-hot" x="470" y="190" width="330" height="44" rx="4"/>
                <text className="t-name" x="484" y="209">Full track: read the file directly</text>
                <text className="t-name" x="484" y="226">Seek: ffmpeg -ss / -to -c:a copy</text>
                <text className="t-tag t-tag-hot" x="820" y="208">cache · remux</text>
                <text className="t-sub" x="820" y="224">local Opus file</text>

                <line className="edge" x1="210" y1="234" x2="210" y2="268" markerEnd="url(#m3)"/>
                <text className="t-edge" x="218" y="255">no</text>

                {/* Q4 */}
                <rect className="box-q" x="60" y="270" width="300" height="44" rx="4"/>
                <text className="t-name" x="210" y="289" textAnchor="middle">Seeking, not a full-track play?</text>
                <text className="t-sub" x="210" y="306" textAnchor="middle">seek &gt; 0 or -to before track end</text>
                <line className="edge" x1="360" y1="292" x2="468" y2="292" markerEnd="url(#m3)"/>
                <text className="t-yes" x="414" y="285" textAnchor="middle">yes</text>
                <rect className="box" x="470" y="270" width="330" height="44" rx="4"/>
                <text className="t-name" x="484" y="289">Download the whole MP3 to the cache,</text>
                <text className="t-name" x="484" y="306">then encode from it with -ss / -to</text>
                <text className="t-tag" x="820" y="288">encode</text>
                <text className="t-sub" x="820" y="304">local MP3</text>

                <line className="edge" x1="210" y1="314" x2="210" y2="348" markerEnd="url(#m3)"/>
                <text className="t-edge" x="218" y="335">no</text>

                {/* Q5 */}
                <rect className="box-q" x="60" y="350" width="300" height="44" rx="4"/>
                <text className="t-name" x="210" y="369" textAnchor="middle">Prefetched by the previous track?</text>
                <text className="t-sub" x="210" y="386" textAnchor="middle">preloadedStreamPaths (used once)</text>
                <line className="edge" x1="360" y1="372" x2="468" y2="372" markerEnd="url(#m3)"/>
                <text className="t-yes" x="414" y="365" textAnchor="middle">yes</text>
                <rect className="box" x="470" y="350" width="330" height="44" rx="4"/>
                <text className="t-name" x="484" y="377">Encode from the prefetched MP3</text>
                <text className="t-tag" x="820" y="368">encode</text>
                <text className="t-sub" x="820" y="384">local MP3</text>

                <line className="edge" x1="210" y1="394" x2="210" y2="428" markerEnd="url(#m3)"/>
                <text className="t-edge" x="218" y="415">no</text>

                {/* Q6 */}
                <rect className="box-q" x="60" y="430" width="300" height="44" rx="4"/>
                <text className="t-name" x="210" y="449" textAnchor="middle">MP3 already in the cache?</text>
                <text className="t-sub" x="210" y="466" textAnchor="middle">key mp3:&lt;id&gt;:320</text>
                <line className="edge" x1="360" y1="452" x2="468" y2="452" markerEnd="url(#m3)"/>
                <text className="t-yes" x="414" y="445" textAnchor="middle">yes</text>
                <rect className="box" x="470" y="430" width="330" height="44" rx="4"/>
                <text className="t-name" x="484" y="449">Encode from the cached MP3,</text>
                <text className="t-name" x="484" y="466">and encode the Opus file in the background</text>
                <text className="t-tag" x="820" y="448">encode</text>
                <text className="t-sub" x="820" y="464">local MP3</text>

                {/* fallthrough */}
                <path className="edge" d="M210 474 V532 H468" markerEnd="url(#m3)"/>
                <text className="t-edge" x="218" y="500">no</text>
                <rect className="box" x="470" y="510" width="330" height="44" rx="4"/>
                <text className="t-name" x="484" y="529">Encode from the Songbird HTTP stream,</text>
                <text className="t-name" x="484" y="546">and cache the MP3 and Opus in the background</text>
                <text className="t-tag" x="820" y="528">encode</text>
                <text className="t-sub" x="820" y="544">HTTP · 15 s burst · retried</text>
              </svg>
            </div>
            <figcaption>Every Songbird track carries an <code>offset</code> and an end time, so even a normal play passes <code>-to</code>. The code checks whether the request actually cuts the track short. Otherwise every fresh play would be treated as a seek and download the whole file first. The background encode in the last two rows is what makes the highlighted row possible the next time the track plays.</figcaption>
          </figure>
        </section>

        {/* 4 */}
        <section id="paths">
          <h2><span className="n">04</span>The five playback paths</h2>
          <p>The decision above produces one of these five streams. The highlighted row is the one the design is built around: no ffmpeg process runs at all. The <code>/health</code> endpoint reports which row is in use as <code>playbackPath</code>.</p>
          <figure>
            <div className="scroll">
              <svg viewBox="0 0 1040 500" role="img" aria-label="Five playback paths. A cached replay reads the Opus file directly with no ffmpeg. A seek in a cached track remuxes with codec copy. A first play and an uncached seek encode MP3 to Opus with libopus. Guilds with voice ducking decode to PCM so discord.js can change the volume live and encode Opus itself. All paths end at the discord.js AudioPlayer.">
                <defs>
                  <marker id="a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="head"/></marker>
                  <marker id="a2h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="head-hot"/></marker>
                  <marker id="a2p" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="head-pcm"/></marker>
                </defs>

                <text className="t-head" x="20" y="30">WHEN</text>
                <text className="t-head" x="240" y="30">INPUT</text>
                <text className="t-head" x="470" y="30">FFMPEG</text>
                <text className="t-head" x="810" y="30">RESOURCE</text>

                <rect className="box-sink" x="960" y="46" width="60" height="436" rx="4"/>
                <text className="t-sink" x="990" y="264" textAnchor="middle" transform="rotate(-90 990 264)">AudioPlayer → Discord voice (UDP)</text>

                <text className="t-tag t-tag-hot" x="20" y="64">cache</text>
                <text className="t-name" x="20" y="82">Replay</text>
                <text className="t-cond" x="20" y="98">full track · volume 100% · file cached</text>
                <rect className="box-hot" x="240" y="50" width="170" height="64" rx="4"/>
                <text className="t-name" x="325" y="78" textAnchor="middle">Opus file</text>
                <text className="t-sub" x="325" y="95" textAnchor="middle">from FileCache</text>
                <line className="edge-hot" x1="410" y1="82" x2="807" y2="82" markerEnd="url(#a2h)"/>
                <text className="t-edge-hot" x="610" y="74" textAnchor="middle">plain file read · no ffmpeg process</text>
                <rect className="box-hot" x="810" y="50" width="120" height="64" rx="4"/>
                <text className="t-name" x="870" y="78" textAnchor="middle">WebmOpus</text>
                <text className="t-sub" x="870" y="95" textAnchor="middle">passthrough</text>
                <line className="edge-hot" x1="930" y1="82" x2="957" y2="82" markerEnd="url(#a2h)"/>

                <line className="lane-rule" x1="20" y1="128" x2="940" y2="128"/>

                <text className="t-tag" x="20" y="156">remux</text>
                <text className="t-name" x="20" y="174">Seek in a cached track</text>
                <text className="t-cond" x="20" y="190">volume 100% · file cached</text>
                <rect className="box" x="240" y="142" width="170" height="64" rx="4"/>
                <text className="t-name" x="325" y="170" textAnchor="middle">Opus file</text>
                <text className="t-sub" x="325" y="187" textAnchor="middle">from FileCache</text>
                <line className="edge" x1="410" y1="174" x2="467" y2="174" markerEnd="url(#a2)"/>
                <rect className="box" x="470" y="142" width="280" height="64" rx="4"/>
                <text className="t-name" x="610" y="170" textAnchor="middle">-ss / -to · -c:a copy</text>
                <text className="t-sub" x="610" y="187" textAnchor="middle">trim only, no re-encode</text>
                <line className="edge" x1="750" y1="174" x2="807" y2="174" markerEnd="url(#a2)"/>
                <rect className="box" x="810" y="142" width="120" height="64" rx="4"/>
                <text className="t-name" x="870" y="170" textAnchor="middle">WebmOpus</text>
                <text className="t-sub" x="870" y="187" textAnchor="middle">passthrough</text>
                <line className="edge" x1="930" y1="174" x2="957" y2="174" markerEnd="url(#a2)"/>

                <line className="lane-rule" x1="20" y1="220" x2="940" y2="220"/>

                <text className="t-tag" x="20" y="248">encode</text>
                <text className="t-name" x="20" y="266">First play</text>
                <text className="t-cond" x="20" y="282">no Opus file yet, or volume &lt; 100%</text>
                <rect className="box" x="240" y="234" width="170" height="64" rx="4"/>
                <text className="t-name" x="325" y="262" textAnchor="middle">MP3 320k</text>
                <text className="t-sub" x="325" y="279" textAnchor="middle">HTTP stream or cache</text>
                <line className="edge" x1="410" y1="266" x2="467" y2="266" markerEnd="url(#a2)"/>
                <rect className="box" x="470" y="234" width="280" height="64" rx="4"/>
                <text className="t-name" x="610" y="262" textAnchor="middle">libopus · channel kbps · FEC</text>
                <text className="t-sub" x="610" y="279" textAnchor="middle">HTTP: 15s burst, then 1.5× read rate</text>
                <line className="edge" x1="750" y1="266" x2="807" y2="266" markerEnd="url(#a2)"/>
                <rect className="box" x="810" y="234" width="120" height="64" rx="4"/>
                <text className="t-name" x="870" y="262" textAnchor="middle">WebmOpus</text>
                <text className="t-sub" x="870" y="279" textAnchor="middle">passthrough</text>
                <line className="edge" x1="930" y1="266" x2="957" y2="266" markerEnd="url(#a2)"/>

                <line className="lane-rule" x1="20" y1="312" x2="940" y2="312"/>

                <text className="t-tag" x="20" y="340">encode</text>
                <text className="t-name" x="20" y="358">Seek, no usable Opus file</text>
                <text className="t-cond" x="20" y="374">not cached, or volume &lt; 100%</text>
                <rect className="box" x="240" y="326" width="170" height="64" rx="4"/>
                <text className="t-name" x="325" y="354" textAnchor="middle">MP3 320k</text>
                <text className="t-sub" x="325" y="371" textAnchor="middle">downloaded in full first</text>
                <line className="edge" x1="410" y1="358" x2="467" y2="358" markerEnd="url(#a2)"/>
                <rect className="box" x="470" y="326" width="280" height="64" rx="4"/>
                <text className="t-name" x="610" y="354" textAnchor="middle">-ss / -to · libopus</text>
                <text className="t-sub" x="610" y="371" textAnchor="middle">volume applied as an ffmpeg filter</text>
                <line className="edge" x1="750" y1="358" x2="807" y2="358" markerEnd="url(#a2)"/>
                <rect className="box" x="810" y="326" width="120" height="64" rx="4"/>
                <text className="t-name" x="870" y="354" textAnchor="middle">WebmOpus</text>
                <text className="t-sub" x="870" y="371" textAnchor="middle">passthrough</text>
                <line className="edge" x1="930" y1="358" x2="957" y2="358" markerEnd="url(#a2)"/>

                <line className="lane-rule" x1="20" y1="404" x2="940" y2="404"/>

                <text className="t-tag t-tag-pcm" x="20" y="432">encode (PCM)</text>
                <text className="t-name" x="20" y="450">Voice ducking on</text>
                <text className="t-cond" x="20" y="466">any play or seek in that guild</text>
                <rect className="box" x="240" y="418" width="170" height="64" rx="4"/>
                <text className="t-name" x="325" y="446" textAnchor="middle">MP3 320k</text>
                <text className="t-sub" x="325" y="463" textAnchor="middle">Opus cache never used</text>
                <line className="edge-pcm" x1="410" y1="450" x2="467" y2="450" markerEnd="url(#a2p)"/>
                <rect className="box-pcm" x="470" y="418" width="280" height="64" rx="4"/>
                <text className="t-name" x="610" y="446" textAnchor="middle">s16le PCM · 48 kHz · stereo</text>
                <text className="t-sub" x="610" y="463" textAnchor="middle">decode only, gain changes live</text>
                <line className="edge-pcm" x1="750" y1="450" x2="807" y2="450" markerEnd="url(#a2p)"/>
                <rect className="box-pcm" x="810" y="418" width="120" height="64" rx="4"/>
                <text className="t-name" x="870" y="446" textAnchor="middle">Raw</text>
                <text className="t-sub" x="870" y="463" textAnchor="middle">inlineVolume</text>
                <line className="edge-pcm" x1="930" y1="450" x2="957" y2="450" markerEnd="url(#a2p)"/>
              </svg>
            </div>
            <figcaption>The Opus file is saved at full volume so a single copy can be reused. That means only guilds at 100% volume can play it directly. Any lower volume has to be applied inside ffmpeg. In the purple row, discord.js decodes nothing but does encode the PCM to Opus itself, and that is the only way to change the volume in the middle of a track. Asking discord.js for Opus input together with a volume control would insert a decoder, a volume transformer and an encoder. The code avoids that on purpose.</figcaption>
          </figure>
        </section>

        {/* 5 */}
        <section id="ffmpeg">
          <h2><span className="n">05</span>The ffmpeg commands</h2>
          <p>All ffmpeg processes are started through <code>ffmpeggy</code> and piped into an <code>fs-capacitor</code> buffer, which the AudioPlayer reads from. A byte counter sits between ffmpeg and that buffer to feed the telemetry (section 10). If ffmpeg hasn't sent its <code>start</code> event within 5 seconds, the attempt fails.</p>
          <div className="cmds">
            <div className="cmd">
              <h3>Input flags, network sources only</h3>
              <pre>{"-reconnect 1 -reconnect_delay_max 5\n-readrate 1.5 -readrate_initial_burst 15\n"}<span className="c">{"# then, for seeks:"}</span>{"\n-ss <start> -to <end>"}</pre>
              <p>Songbird replies to ranged requests with at most 1 MiB per response. Without <code>-reconnect</code>, ffmpeg treats that as end of file and the track stops after about 26 seconds. The burst flag needs ffmpeg 6.1 or newer. This is checked once at startup, and older versions get only <code>-readrate 1.5</code>.</p>
            </div>
            <div className="cmd">
              <h3>Opus output (the encode path)</h3>
              <pre>{"-vn -c:a libopus -b:a <kbps>k\n-ar 48000 -ac 2\n-packet_loss 5 -fec 1\n-f webm\n[-filter:a volume=<0.0–1.0>]"}</pre>
              <p>The bitrate is the voice channel's bitrate, capped at 128k, or 64k if the channel's bitrate is unknown. The volume filter is only added when volume is below 100%.</p>
            </div>
            <div className="cmd hot">
              <h3>Copy output (the remux path)</h3>
              <pre>{"-vn -c:a copy -f webm"}</pre>
              <p>Trims the cached Opus file at the seek point without decoding it. Seeking costs no encode and loses no quality.</p>
            </div>
            <div className="cmd pcm">
              <h3>PCM output (the ducking path)</h3>
              <pre>{"-vn -f s16le -ar 48000 -ac 2"}</pre>
              <p>The stream reaches discord.js as <code>StreamType.Raw</code> with <code>inlineVolume: true</code>, which is 192,000 bytes per second.</p>
            </div>
            <div className="cmd">
              <h3>Background Opus encode</h3>
              <pre>{"-i <cached mp3>\n-vn -c:a libopus -b:a <kbps>k\n-ar 48000 -ac 2 -packet_loss 5 -fec 1\n-f webm   "}<span className="c">{"# → FileCache, key opus:<id>:<kbps>"}</span></pre>
              <p>The same settings as the live encode, so the output is identical. It runs through a pool shared by every guild that allows 2 encodes at once, and the process is set to <code>nice 10</code>. If the encode is cut short it is thrown away and never reaches the cache.</p>
            </div>
          </div>
        </section>

        {/* 6 */}
        <section id="states">
          <h2><span className="n">06</span>Player states</h2>
          <p><code>Player.status</code> has three values. A new Player starts in <code>PAUSED</code>. When the discord.js AudioPlayer reports <code>Idle</code>, the current track has ended, and this is what moves the queue forward.</p>
          <figure>
            <div className="scroll">
              <svg viewBox="0 0 1040 320" role="img" aria-label="Player state machine with PAUSED, PLAYING and IDLE. play or seek moves to PLAYING, pause moves back to PAUSED. When a track ends, the player loops the track, re-adds it for queue loop, or moves forward. When the queue runs out it becomes IDLE, and /play starts it again. IDLE disconnects after secondsToWaitAfterQueueEmpties. Any state disconnects when the channel empties or reconnects fail.">
                <defs>
                  <marker id="m6" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="head"/></marker>
                  <marker id="m6b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="head-bad"/></marker>
                </defs>
                <rect className="box" x="40" y="110" width="180" height="60" rx="30"/>
                <text className="t-name" x="130" y="137" textAnchor="middle">PAUSED</text>
                <text className="t-sub" x="130" y="154" textAnchor="middle">initial state</text>
                <rect className="box-hot" x="420" y="110" width="200" height="60" rx="30"/>
                <text className="t-name" x="520" y="137" textAnchor="middle">PLAYING</text>
                <text className="t-sub" x="520" y="154" textAnchor="middle">timers running</text>
                <rect className="box" x="800" y="110" width="200" height="60" rx="30"/>
                <text className="t-name" x="900" y="137" textAnchor="middle">IDLE</text>
                <text className="t-sub" x="900" y="154" textAnchor="middle">queue finished</text>
                <rect className="box-end" x="420" y="240" width="200" height="50" rx="4"/>
                <text className="t-name" x="520" y="264" textAnchor="middle">disconnect()</text>
                <text className="t-sub" x="520" y="280" textAnchor="middle">records "disconnected"</text>

                <line className="edge" x1="220" y1="126" x2="418" y2="126" markerEnd="url(#m6)"/>
                <text className="t-edge" x="320" y="118" textAnchor="middle">play() · seek()</text>
                <line className="edge" x1="420" y1="154" x2="222" y2="154" markerEnd="url(#m6)"/>
                <text className="t-edge" x="320" y="171" textAnchor="middle">pause()</text>

                <line className="edge" x1="620" y1="126" x2="798" y2="126" markerEnd="url(#m6)"/>
                <text className="t-edge" x="710" y="118" textAnchor="middle">queue ran out</text>
                <line className="edge" x1="800" y1="154" x2="622" y2="154" markerEnd="url(#m6)"/>
                <text className="t-edge" x="710" y="171" textAnchor="middle">/play adds a song</text>

                <path className="edge" d="M480 110 C480 46, 560 46, 560 108" markerEnd="url(#m6)"/>
                <text className="t-edge" x="520" y="30" textAnchor="middle">track ends: loop track → seek(0)</text>
                <text className="t-edge" x="520" y="44" textAnchor="middle">loop queue → re-add · else forward(1)</text>

                <path className="edge-bad" d="M900 170 V265 H622" markerEnd="url(#m6b)"/>
                <text className="t-edge-bad" x="760" y="257" textAnchor="middle">after secondsToWaitAfterQueueEmpties</text>
                <line className="edge-bad" x1="520" y1="170" x2="520" y2="238" markerEnd="url(#m6b)"/>
                <text className="t-edge-bad" x="528" y="205">channel empty · reconnects used up</text>
                <path className="edge-bad" d="M130 170 V265 H418" markerEnd="url(#m6b)"/>
                <text className="t-edge-bad" x="275" y="257" textAnchor="middle">channel empty · /disconnect</text>
              </svg>
            </div>
            <figcaption>A timeout of 0 means "never leave". The "channel empty" rule only applies when <code>leaveIfNoListeners</code> is on, and it checks on every voice state change in the guild, ignoring bots. If the voice connection dropped while paused, resuming calls <code>seek(position)</code> to rebuild the stream. While playing, a 1-second timer tracks the position, a 5-second timer edits the now-playing embed, and a 1-second timer collects telemetry.</figcaption>
          </figure>
        </section>

        {/* 7 */}
        <section id="volume">
          <h2><span className="n">07</span>Volume and ducking</h2>
          <p>How a volume change is applied depends on the path. On the passthrough path nothing between ffmpeg and Discord can change the gain, so a volume change restarts the stream at the current position.</p>
          <figure>
            <div className="scroll">
              <svg viewBox="0 0 1040 250" role="img" aria-label="Volume changes come from the voice receiver when people speak, or from the volume command and buttons. setVolume applies them instantly to the inline volume on the PCM path, or debounces 400 ms and restarts ffmpeg at the current position with a volume filter on the passthrough path.">
                <defs>
                  <marker id="m7" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="head"/></marker>
                  <marker id="m7p" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="head-pcm"/></marker>
                </defs>
                <rect className="box-ext" x="20" y="40" width="180" height="56" rx="4"/>
                <text className="t-name" x="110" y="64" textAnchor="middle">Someone speaks</text>
                <text className="t-sub" x="110" y="81" textAnchor="middle">receiver start / end</text>
                <rect className="box-ext" x="20" y="150" width="180" height="56" rx="4"/>
                <text className="t-name" x="110" y="174" textAnchor="middle">/volume · buttons</text>
                <text className="t-sub" x="110" y="191" textAnchor="middle">steps of 10</text>

                <rect className="box" x="280" y="95" width="170" height="56" rx="4"/>
                <text className="t-name" x="365" y="119" textAnchor="middle">setVolume(level)</text>
                <text className="t-sub" x="365" y="136" textAnchor="middle">0–100</text>
                <path className="edge-pcm" d="M200 68 H240 V112 H278" markerEnd="url(#m7p)"/>
                <text className="t-edge" x="208" y="60">target or default</text>
                <path className="edge" d="M200 178 H240 V134 H278" markerEnd="url(#m7)"/>

                <rect className="box-pcm" x="540" y="40" width="220" height="56" rx="4"/>
                <text className="t-name" x="650" y="64" textAnchor="middle">resource.volume.setVolume()</text>
                <text className="t-sub" x="650" y="81" textAnchor="middle">instant · PCM path</text>
                <path className="edge-pcm" d="M450 115 H495 V68 H538" markerEnd="url(#m7p)"/>
                <text className="t-edge" x="458" y="60">ducking on</text>

                <rect className="box" x="540" y="150" width="200" height="56" rx="4"/>
                <text className="t-name" x="640" y="174" textAnchor="middle">Wait 400 ms</text>
                <text className="t-sub" x="640" y="191" textAnchor="middle">later changes reset it</text>
                <path className="edge" d="M450 131 H495 V178 H538" markerEnd="url(#m7)"/>
                <text className="t-edge" x="458" y="198">ducking off</text>

                <rect className="box" x="810" y="150" width="210" height="56" rx="4"/>
                <text className="t-name" x="915" y="174" textAnchor="middle">seek(position)</text>
                <text className="t-sub" x="915" y="191" textAnchor="middle">new ffmpeg + volume filter</text>
                <line className="edge" x1="740" y1="178" x2="808" y2="178" markerEnd="url(#m7)"/>
                <text className="t-edge" x="774" y="170" textAnchor="middle">restart</text>
                <text className="t-edge" x="915" y="226" textAnchor="middle">live streams: applies next track</text>
              </svg>
            </div>
            <figcaption>Speaking events are only listened for in guilds with <code>turnDownVolumeWhenPeopleSpeak</code> turned on, and those guilds always use the PCM path, so ducking is always instant. While anyone in the channel is speaking, the volume drops to <code>turnDownVolumeWhenPeopleSpeakTarget</code> (20 by default). When the last speaker stops, it goes back to the guild's default volume. Restarting at the current position at 100% volume can use the cached-file path again.</figcaption>
          </figure>
        </section>

        {/* 8 */}
        <section id="cache">
          <h2><span className="n">08</span>File cache: warming, writing, eviction</h2>
          <p>Two kinds of file go into the cache: the source MP3, under the key <code>mp3:&lt;id&gt;:320</code>, and the encoded Opus, under <code>opus:&lt;id&gt;:&lt;kbps&gt;</code>. Each key is hashed to a filename. When a track starts, the bot also prepares the next track in the queue.</p>
          <figure>
            <div className="scroll">
              <svg viewBox="0 0 1040 230" role="img" aria-label="While track N plays, the bot prefetches track N+1: it downloads the MP3, then encodes it to Opus. At most two of these encodes run at once, at low CPU priority. Both files are written to the FileCache.">
                <defs>
                  <marker id="a3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="head"/></marker>
                </defs>
                <rect className="box" x="20" y="38" width="200" height="60" rx="4"/>
                <text className="t-name" x="120" y="64" textAnchor="middle">Track N starts playing</text>
                <text className="t-sub" x="120" y="82" textAnchor="middle">Player.play()</text>
                <rect className="box" x="290" y="38" width="180" height="60" rx="4"/>
                <text className="t-name" x="380" y="64" textAnchor="middle">prefetchNextSong</text>
                <text className="t-sub" x="380" y="82" textAnchor="middle">Songbird, not live</text>
                <rect className="box" x="540" y="38" width="200" height="60" rx="4"/>
                <text className="t-name" x="640" y="64" textAnchor="middle">downloadAndCacheMP3</text>
                <text className="t-sub" x="640" y="82" textAnchor="middle">got.stream → cache</text>
                <rect className="box-hot" x="810" y="38" width="210" height="60" rx="4"/>
                <text className="t-name" x="915" y="64" textAnchor="middle">transcodeAndCacheOpus</text>
                <text className="t-sub" x="915" y="82" textAnchor="middle">max 2 at once · nice 10</text>

                <line className="edge" x1="220" y1="68" x2="288" y2="68" markerEnd="url(#a3)"/>
                <text className="t-edge" x="255" y="60" textAnchor="middle">N+1</text>
                <line className="edge" x1="470" y1="68" x2="538" y2="68" markerEnd="url(#a3)"/>
                <text className="t-edge" x="505" y="60" textAnchor="middle">fetch</text>
                <line className="edge" x1="740" y1="68" x2="808" y2="68" markerEnd="url(#a3)"/>
                <text className="t-edge" x="775" y="60" textAnchor="middle">encode</text>

                <rect className="box" x="540" y="150" width="480" height="60" rx="4"/>
                <text className="t-name" x="780" y="176" textAnchor="middle">FileCache</text>
                <text className="t-sub" x="780" y="194" textAnchor="middle">see the write path below</text>
                <line className="edge" x1="640" y1="98" x2="640" y2="148" markerEnd="url(#a3)"/>
                <text className="t-edge" x="648" y="128">writes .mp3</text>
                <line className="edge" x1="915" y1="98" x2="915" y2="148" markerEnd="url(#a3)"/>
                <text className="t-edge" x="923" y="128">writes .opus</text>

                <text className="t-edge" x="20" y="168">The same warm-up runs during a first play,</text>
                <text className="t-edge" x="20" y="184">alongside the live encode. Ducking guilds</text>
                <text className="t-edge" x="20" y="200">only warm the MP3.</text>
              </svg>
            </div>
            <figcaption>Two in-memory maps per player (<code>mp3CacheInFlight</code> and <code>opusCacheInFlight</code>) make sure the same file is never downloaded or encoded twice at the same time. The track that will play next is remembered in <code>preloadedStreamPaths</code> so <code>getStream()</code> can skip the database lookup.</figcaption>
          </figure>

          <figure>
            <div className="scroll">
              <svg viewBox="0 0 1040 220" role="img" aria-label="Cache write path: data streams to a tmp file, which is renamed into the cache directory when the write finishes, then a FileCache row is upserted with the size and access time, then a serialized eviction job deletes the least recently accessed files until the cache is under CACHE_LIMIT. Reads through getPathFor update the access time.">
                <defs>
                  <marker id="m8" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="head"/></marker>
                  <marker id="m8b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" className="head-bad"/></marker>
                </defs>
                <rect className="box" x="20" y="40" width="180" height="56" rx="4"/>
                <text className="t-name" x="110" y="64" textAnchor="middle">createWriteStream</text>
                <text className="t-sub" x="110" y="81" textAnchor="middle">CACHE_DIR/tmp/&lt;hash&gt;</text>
                <rect className="box" x="260" y="40" width="190" height="56" rx="4"/>
                <text className="t-name" x="355" y="64" textAnchor="middle">stat + rename</text>
                <text className="t-sub" x="355" y="81" textAnchor="middle">CACHE_DIR/&lt;hash&gt;</text>
                <rect className="box" x="510" y="40" width="190" height="56" rx="4"/>
                <text className="t-name" x="605" y="64" textAnchor="middle">FileCache row</text>
                <text className="t-sub" x="605" y="81" textAnchor="middle">hash · bytes · accessedAt</text>
                <rect className="box-end" x="760" y="40" width="260" height="56" rx="4"/>
                <text className="t-name" x="890" y="64" textAnchor="middle">Evict oldest accessedAt</text>
                <text className="t-sub" x="890" y="81" textAnchor="middle">until total ≤ CACHE_LIMIT</text>

                <line className="edge" x1="200" y1="68" x2="258" y2="68" markerEnd="url(#m8)"/>
                <text className="t-edge" x="229" y="60" textAnchor="middle">finish</text>
                <line className="edge" x1="450" y1="68" x2="508" y2="68" markerEnd="url(#m8)"/>
                <text className="t-edge" x="479" y="60" textAnchor="middle">upsert</text>
                <line className="edge-bad" x1="700" y1="68" x2="758" y2="68" markerEnd="url(#m8b)"/>
                <text className="t-edge-bad" x="729" y="60" textAnchor="middle">queue</text>

                <rect className="box" x="510" y="140" width="190" height="56" rx="4"/>
                <text className="t-name" x="605" y="164" textAnchor="middle">getPathFor(hash)</text>
                <text className="t-sub" x="605" y="181" textAnchor="middle">every cache hit</text>
                <line className="edge" x1="605" y1="140" x2="605" y2="98" markerEnd="url(#m8)"/>
                <text className="t-edge" x="613" y="124">bumps accessedAt</text>

                <text className="t-edge" x="20" y="132">empty file → rejected</text>
                <text className="t-edge" x="20" y="148">cut-short encode → stream destroyed,</text>
                <text className="t-edge" x="20" y="164">nothing committed</text>
                <text className="t-edge" x="760" y="124">one eviction job at a time,</text>
                <text className="t-edge" x="760" y="140">shared by all guilds (PQueue)</text>
              </svg>
            </div>
            <figcaption>Eviction removes the least recently used files. On startup, <code>cleanup()</code> deletes files on disk that have no database row, then runs eviction once. <code>CACHE_LIMIT</code> covers both MP3 and Opus files. At 128k, the Opus file is about 40% the size of the 320k MP3, so caching a track takes about 1.4 times the MP3 size.</figcaption>
          </figure>
        </section>

        {/* 9 */}
        <section id="failures">
          <h2><span className="n">09</span>What happens when things fail</h2>
          <p>Retries happen at three levels, from fast and local to slow and global. Each level only gives up after its own limit, then hands the problem to the queue by skipping the track or disconnecting.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Failure</th><th>Response</th><th>Limit</th><th>When the limit is reached</th></tr></thead>
              <tbody>
                <tr><td>ffmpeg won't start (spawn error or no <code>start</code> event within 5 s), on network inputs</td><td>Retry <code>createReadStream</code></td><td className="v">2 retries · 250, 500 ms</td><td className="m"><code>play()</code> throws, skips to the next track and re-throws to the caller</td></tr>
                <tr><td>AudioPlayer emits <code>error</code> during a track</td><td>Wait, then <code>seek(position)</code>. Live streams use <code>play()</code> instead</td><td className="v">2 retries · 300, 600 ms</td><td className="m">Records the play as <code>error</code> and skips</td></tr>
                <tr><td>Voice connection goes to <code>Disconnected</code></td><td>Destroy the connection, <code>connect()</code> again, then <code>seek(position)</code></td><td className="v">5 tries · 1 s ×2ⁿ, max 30 s</td><td className="m"><code>disconnect()</code></td></tr>
                <tr><td>Songbird returns <code>410 Gone</code></td><td>Skip to the next track</td><td className="v">none</td><td className="m">Logged as unavailable</td></tr>
                <tr><td>Songbird sends 1 MiB ranges, or the connection drops mid-track</td><td>ffmpeg <code>-reconnect</code> resumes at the byte where it stopped</td><td className="v">delay ≤ 5 s</td><td className="m">Without this flag, every streamed track stopped at about 26 s</td></tr>
                <tr><td>A stale voice connection fires <code>Disconnected</code> after a rejoin</td><td>Ignored, by checking that it is the current connection</td><td className="v">none</td><td className="m">Stops an old connection from tearing down the new one</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 10 */}
        <section id="telemetry">
          <h2><span className="n">10</span>Telemetry</h2>
          <p>Two numbers tell a network problem apart from a CPU problem. Both are sampled every second for each guild that is playing, appear in <code>GET /health</code>, and are printed with <code>DEBUG=ISOBEL:audio</code> together with the event-loop lag.</p>
          <div className="formula">
            <div>
              <h3>cushionSeconds</h3>
              <pre>{"bytesFromFfmpeg / byteRate\n  − playbackDuration / 1000\n\nbyteRate = kbps × 1000 / 8    "}<span className="c">{"# Opus"}</span>{"\nbyteRate = 192 000             "}<span className="c">{"# PCM"}</span></pre>
              <p>How far ffmpeg is ahead of the listener. It should climb toward 15 s after a track starts. If it stays near zero, the input is being read at real-time speed and any network hiccup will be heard. It shows <code>null</code> on the cached-file path, where there is no ffmpeg to measure.</p>
            </div>
            <div>
              <h3>lostPlaybackMs</h3>
              <pre>{"Σ max(0, wallElapsed − played)"}</pre>
              <p>Wall-clock time during which playback didn't advance, which is audible stutter. If this grows while the cushion is healthy, the cause is the event loop, not the network. Background encodes are capped and niced for this reason.</p>
            </div>
            <div>
              <h3>Position</h3>
              <pre>{"positionAtStreamStart\n  + floor(playbackDuration / 1000)"}</pre>
              <p>Position comes from how much audio has actually played, not from the wall clock. A stall therefore can't push the progress bar or a later <code>seek(position)</code> ahead of what the listener heard.</p>
            </div>
          </div>
        </section>

        {/* 11 */}
        <section id="numbers">
          <h2><span className="n">11</span>Numbers and where they live</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Constant</th><th>Value</th><th>Effect</th></tr></thead>
              <tbody>
                <tr><td><code>AUDIO_BITRATE_KBPS</code></td><td className="v">320</td><td className="m">MP3 bitrate requested from Songbird</td></tr>
                <tr><td><code>OPUS_MAX_BITRATE_KBPS</code> / <code>FALLBACK</code></td><td className="v">128 / 64</td><td className="m">Upper limit on the channel bitrate, and the value used when the channel's bitrate is unknown</td></tr>
                <tr><td><code>STREAM_READ_BURST_SECONDS</code> / <code>RATE</code></td><td className="v">15 s / 1.5×</td><td className="m">How far ahead network inputs are read</td></tr>
                <tr><td><code>OPUS_EXPECTED_PACKET_LOSS_PERCENT</code></td><td className="v">5</td><td className="m">Sizes Opus error correction (FEC)</td></tr>
                <tr><td><code>BACKGROUND_ENCODE_CONCURRENCY</code> / <code>NICE</code></td><td className="v">2 / 10</td><td className="m">Limits on prefetch encodes across all guilds</td></tr>
                <tr><td><code>VOLUME_RESPAWN_DEBOUNCE_MS</code></td><td className="v">400</td><td className="m">How long to wait before restarting the stream after a volume change</td></tr>
                <tr><td><code>FFMPEG_START_TIMEOUT_MS</code></td><td className="v">5000</td><td className="m">How long ffmpeg has to report <code>start</code></td></tr>
                <tr><td><code>STREAM_CREATE_MAX_RETRIES</code> / base</td><td className="v">2 / 250 ms</td><td className="m">Retries when ffmpeg fails to start</td></tr>
                <tr><td><code>PLAYBACK_ERROR_MAX_RETRIES</code> / base</td><td className="v">2 / 300 ms</td><td className="m">Retries for AudioPlayer errors</td></tr>
                <tr><td><code>RECONNECT_MAX_ATTEMPTS</code> / base / max</td><td className="v">5 / 1 s / 30 s</td><td className="m">Voice reconnect backoff</td></tr>
                <tr><td><code>AUDIO_PLAYER_MAX_MISSED_FRAMES</code></td><td className="v">80</td><td className="m">How many frames the AudioPlayer may miss before it stops, set high for live streams</td></tr>
                <tr><td><code>NOW_PLAYING_UPDATE_INTERVAL_MS</code></td><td className="v">5000</td><td className="m">How often the progress bar embed is edited</td></tr>
              </tbody>
            </table>
          </div>
          <ul className="files">
            <li><code>src/services/player.ts</code><span>getStream, createReadStream, the state machine, retries, volume, telemetry</span></li>
            <li><code>src/managers/player.ts</code><span>The map from guild to Player, and snapshots for /health</span></li>
            <li><code>src/services/add-query-to-queue.ts</code><span>Joins voice in parallel with resolving the query, queue limits</span></li>
            <li><code>src/services/get-songs.ts</code><span>Routes track IDs, URLs, YouTube links and HLS streams</span></li>
            <li><code>src/services/starchild-api.ts</code><span>Songbird search, track lookup, stream URLs, search caches</span></li>
            <li><code>src/services/file-cache.ts</code><span>The tmp-then-rename write, LRU eviction, orphan cleanup</span></li>
            <li><code>src/utils/constants.ts</code><span>Every value in the table above, with the reasoning behind it</span></li>
            <li><code>src/utils/ffmpeg-capabilities.ts</code><span>Detects support for -readrate_initial_burst once at startup</span></li>
            <li><code>src/services/playback-history.ts</code><span>SongPlay and PlaybackAction rows: finished, skipped, back, stopped, error, disconnected</span></li>
            <li><code>src/events/voice-state-update.ts</code><span>leaveIfNoListeners</span></li>
          </ul>
        </section>
      </div>
    </main>
  );
}
