-- CreateTable
CREATE TABLE "FileCache" (
    "hash" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileCache_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "KeyValueCache" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeyValueCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Setting" (
    "guildId" TEXT NOT NULL,
    "playlistLimit" INTEGER NOT NULL DEFAULT 50,
    "secondsToWaitAfterQueueEmpties" INTEGER NOT NULL DEFAULT 30,
    "leaveIfNoListeners" BOOLEAN NOT NULL DEFAULT true,
    "queueAddResponseEphemeral" BOOLEAN NOT NULL DEFAULT false,
    "autoAnnounceNextSong" BOOLEAN NOT NULL DEFAULT false,
    "defaultVolume" INTEGER NOT NULL DEFAULT 100,
    "defaultQueuePageSize" INTEGER NOT NULL DEFAULT 10,
    "turnDownVolumeWhenPeopleSpeak" BOOLEAN NOT NULL DEFAULT false,
    "turnDownVolumeWhenPeopleSpeakTarget" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "FavoriteQuery" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FavoriteQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteQuery_guildId_name_key" ON "FavoriteQuery"("guildId", "name");
