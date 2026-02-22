// File: src/services/file-cache.ts

import { type FileCache } from '@prisma/client';
import { createWriteStream, promises as fs } from 'fs';
import { inject, injectable } from 'inversify';
import PQueue from 'p-queue';
import path from 'path';
import { TYPES } from '../types.js';
import { prisma } from '../utils/db.js';
import debug from '../utils/debug.js';
import type Config from './config.js';

@injectable()
export default class FileCacheProvider {
  private static readonly evictionQueue = new PQueue({concurrency: 1});
  private readonly config: Config;

  constructor(@inject(TYPES.Config) config: Config) {
    this.config = config;
  }

  /**
   * Validates hash format to prevent path traversal attacks
   */
  private validateHash(hash: string): void {
    if (!/^[a-f0-9]+$/i.test(hash) || hash.length < 32) {
      throw new Error(`Invalid hash format: ${hash}`);
    }
  }

  /**
   * Returns path to cached file if it exists, otherwise returns null.
   * Updates the `accessedAt` property of the cached file.
   * @param hash lookup key
   */
  async getPathFor(hash: string): Promise<string | null> {
    this.validateHash(hash);
    const model = await prisma.fileCache.findUnique({
      where: {
        hash,
      },
    });

    if (!model) {
      return null;
    }

    const resolvedPath = path.join(this.config.CACHE_DIR, hash);

    try {
      await fs.access(resolvedPath);
    } catch {
      await prisma.fileCache.delete({
        where: {
          hash,
        },
      });

      return null;
    }

    await prisma.fileCache.update({
      where: {
        hash,
      },
      data: {
        accessedAt: new Date(),
      },
    });

    return resolvedPath;
  }

  /**
   * Returns a write stream and a `committed` promise for the given hash key.
   * The stream handles saving a new file. The `committed` promise resolves
   * with the final file path once the data has been moved out of tmp and
   * recorded in the database, or `null` if the write was empty / failed.
   * @param hash lookup key
   */
  createWriteStream(hash: string): { stream: ReturnType<typeof createWriteStream>; committed: Promise<string | null> } {
    this.validateHash(hash);
    const tmpPath = path.join(this.config.CACHE_DIR, 'tmp', hash);
    const finalPath = path.join(this.config.CACHE_DIR, hash);

    const stream = createWriteStream(tmpPath);

    const committed = new Promise<string | null>((resolve, reject) => {
      stream.on('close', () => {
        void (async () => {
          try {
            const stats = await fs.stat(tmpPath);

            if (stats.size === 0) {
              resolve(null);
              return;
            }

            await fs.rename(tmpPath, finalPath);

            await prisma.fileCache.create({
              data: {
                hash,
                accessedAt: new Date(),
                bytes: stats.size,
              },
            });

            await this.evictOldestIfNecessary();
            resolve(finalPath);
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        })();
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });

    return { stream, committed };
  }

  /**
   * Deletes orphaned cache files and evicts files if
   * necessary. Should be run on program startup so files
   * will be evicted if the cache limit has changed.
   */
  async cleanup() {
    await this.removeOrphans();
    await this.evictOldestIfNecessary();
  }

  private async evictOldestIfNecessary() {
    void FileCacheProvider.evictionQueue.add(this.evictOldest.bind(this));

    return FileCacheProvider.evictionQueue.onEmpty();
  }

  private async evictOldest() {
    debug('Evicting oldest files...');

    let totalSizeBytes = await this.getDiskUsageInBytes();
    let numOfEvictedFiles = 0;
    // Continue to evict until we're under the limit
    while (totalSizeBytes > this.config.CACHE_LIMIT_IN_BYTES) {
      const oldest = await prisma.fileCache.findFirst({
        orderBy: {
          accessedAt: 'asc',
        },

      });

      if (!oldest) {
        break;
      }

      // Subtract before deleting to avoid recalculating total size
      totalSizeBytes -= oldest.bytes;

      await prisma.fileCache.delete({
        where: {
          hash: oldest.hash,
        },
      });
      await fs.unlink(path.join(this.config.CACHE_DIR, oldest.hash));
      debug(`${oldest.hash} has been evicted`);
      numOfEvictedFiles++;
    }

    if (numOfEvictedFiles > 0) {
      debug(`${numOfEvictedFiles} files have been evicted`);
    } else {
      debug(`No files needed to be evicted. Total size of the cache is currently ${totalSizeBytes} bytes, and the cache limit is ${this.config.CACHE_LIMIT_IN_BYTES} bytes.`);
    }
  }

  private async removeOrphans() {
    // Check filesystem direction (do files exist on the disk but not in the database?)
    // Batch database queries to avoid N+1 problem
    const allFiles = new Set<string>();
    for await (const dirent of await fs.opendir(this.config.CACHE_DIR)) {
      if (dirent.isFile() && dirent.name !== 'tmp') {
        allFiles.add(dirent.name);
      }
    }

    if (allFiles.size === 0) {
      return;
    }

    const allHashes = await prisma.fileCache.findMany({
      select: {hash: true},
    });
    const dbHashes = new Set(allHashes.map((m: {hash: string}) => m.hash));

    const orphans = [...allFiles].filter(f => !dbHashes.has(f));
    if (orphans.length > 0) {
      await Promise.all(orphans.map(hash => {
        debug(`${hash} was present on disk but was not in the database. Removing from disk.`);
        return fs.unlink(path.join(this.config.CACHE_DIR, hash));
      }));
    }

    // Check database direction (do entries exist in the database but not on the disk?)
    for await (const model of this.getFindAllIterable()) {
      const filePath = path.join(this.config.CACHE_DIR, model.hash);

      try {
        await fs.access(filePath);
      } catch {
        debug(`${model.hash} was present in database but was not on disk. Removing from database.`);
        await prisma.fileCache.delete({
          where: {
            hash: model.hash,
          },
        });
      }
    }
  }

  /**
   * Pulls from the database rather than the filesystem,
   * so may be slightly inaccurate.
   * @returns the total size of the cache in bytes
   */
  private async getDiskUsageInBytes() {
    const data = await prisma.fileCache.aggregate({
      _sum: {
        bytes: true,
      },
    });
    const totalSizeBytes = data._sum.bytes ?? 0;

    return totalSizeBytes;
  }

  /**
   * An efficient way to iterate over all rows.
   * @returns an iterable for the result of FileCache.findAll()
   */
  private getFindAllIterable() {
    const limit = 50;
    let previousCreatedAt: Date | null = null;

    let models: FileCache[] = [];

    const fetchNextBatch = async () => {
      let where;

      if (previousCreatedAt) {
        where = {
          createdAt: {
            gt: previousCreatedAt,
          },
        };
      }

      models = await prisma.fileCache.findMany({
        where,
        orderBy: {
          createdAt: 'asc',
        },
        take: limit,
      });

      if (models.length > 0) {
        previousCreatedAt = models[models.length - 1].createdAt;
      }
    };

    return {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            if (models.length === 0) {
              await fetchNextBatch();
            }

            if (models.length === 0) {
              return {done: true, value: undefined} as IteratorResult<FileCache>;
            }

            return {value: models.shift()!, done: false};
          },
        };
      },
    };
  }
}
