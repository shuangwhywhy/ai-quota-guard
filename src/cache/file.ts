import * as fs from 'fs/promises';
import * as path from 'path';
import { SerializedCacheEntry } from './types.js';
import { BaseCache } from './base.js';

export class FileCache extends BaseCache {
  private cacheDir: string;

  constructor(cacheDir: string = '.quota-guard/cache') {
    super();
    this.cacheDir = path.resolve(process.cwd(), cacheDir);
  }

  private async ensureDir() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch {
      // ignore
    }
  }

  private getFilePath(key: string): string {
    // Sanitizing key for filesystem use
    const safeKey = key.replace(/[^a-z0-9]/gi, '_');
    return path.join(this.cacheDir, `${safeKey}.json`);
  }

  async set(key: string, data: SerializedCacheEntry): Promise<void> {
    await this.ensureDir();
    const filePath = this.getFilePath(key);
    await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');
  }

  protected async _get(key: string): Promise<SerializedCacheEntry | null> {
    const filePath = this.getFilePath(key);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as SerializedCacheEntry;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore
    }
  }

  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(this.cacheDir, file));
        }
      }
    } catch {
      // ignore
    }
  }
}

