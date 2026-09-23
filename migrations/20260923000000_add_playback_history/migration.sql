-- File: migrations/20260923000000_add_playback_history/migration.sql

-- CreateTable
CREATE TABLE "SongPlay" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "guildName" TEXT,
    "voiceChannelId" TEXT,
    "textChannelId" TEXT,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "lengthSeconds" INTEGER NOT NULL,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "playlistTitle" TEXT,
    "requestedBy" TEXT NOT NULL,
    "requestedByName" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "playedSeconds" INTEGER,
    "endReason" TEXT,
    "endedBy" TEXT,
    "endedByName" TEXT,

    CONSTRAINT "SongPlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybackAction" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "guildName" TEXT,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "songTitle" TEXT,
    "songArtist" TEXT,
    "songPlayId" INTEGER,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybackAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SongPlay_guildId_startedAt_idx" ON "SongPlay"("guildId", "startedAt");

-- CreateIndex
CREATE INDEX "SongPlay_startedAt_idx" ON "SongPlay"("startedAt");

-- CreateIndex
CREATE INDEX "SongPlay_requestedBy_idx" ON "SongPlay"("requestedBy");

-- CreateIndex
CREATE INDEX "PlaybackAction_guildId_createdAt_idx" ON "PlaybackAction"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "PlaybackAction_createdAt_idx" ON "PlaybackAction"("createdAt");

-- CreateIndex
CREATE INDEX "PlaybackAction_userId_idx" ON "PlaybackAction"("userId");

-- AddForeignKey
ALTER TABLE "PlaybackAction" ADD CONSTRAINT "PlaybackAction_songPlayId_fkey" FOREIGN KEY ("songPlayId") REFERENCES "SongPlay"("id") ON DELETE SET NULL ON UPDATE CASCADE;
