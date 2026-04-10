import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileCache } from '../../src/cache/file';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('FileCache', () => {
  const TEST_CACHE_DIR = '.quota-guard/test-cache';
  let cache: FileCache;

  beforeEach(async () => {
    cache = new FileCache(TEST_CACHE_DIR);
    await cache.clear();
  });

  afterEach(async () => {
    // Clean up
    try {
      await fs.rm(path.resolve(process.cwd(), TEST_CACHE_DIR), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('sets and gets cache entries persistently', async () => {
    const entry = {
      responsePayloadBase64: 'file-base64',
      headers: { 'Content-Type': 'text/plain' },
      status: 200,
      timestamp: Date.now()
    };

    await cache.set('file-key', entry);
    
    // Verify file actually exists
    const safeKey = 'file_key';
    const filePath = path.resolve(process.cwd(), TEST_CACHE_DIR, `${safeKey}.json`);
    const fileContent = await fs.readFile(filePath, 'utf-8');
    expect(JSON.parse(fileContent)).toEqual(entry);

    const result = await cache.get('file-key', 5000);
    expect(result).toEqual(entry);
  });

  it('honors TTL and deletes expired files', async () => {
    const entry = {
      responsePayloadBase64: 'stale-file',
      headers: {},
      status: 200,
      timestamp: Date.now() - 6000 // 6 seconds ago
    };

    await cache.set('stale-key', entry);
    
    const result = await cache.get('stale-key', 5000); // 5 second TTL
    expect(result).toBeNull();

    // Verify file is deleted
    const filePath = path.resolve(process.cwd(), TEST_CACHE_DIR, `stale_key.json`);
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it('clears all entries in the directory', async () => {
    await cache.set('k1', { responsePayloadBase64: 'd1', headers: {}, status: 200, timestamp: Date.now() });
    await cache.set('k2', { responsePayloadBase64: 'd2', headers: {}, status: 200, timestamp: Date.now() });
    
    await cache.clear();
    
    const files = await fs.readdir(path.resolve(process.cwd(), TEST_CACHE_DIR));
    expect(files.filter(f => f.endsWith('.json')).length).toBe(0);
  });
});
