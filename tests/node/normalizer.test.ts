import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateStableKey, deepSortKeys, INTELLIGENT_KEY_FIELDS } from '../../src/keys/normalizer';

describe('Key Normalizer (Crypto Branches)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates consistent async crypto keys for identical payloads', async () => {
    const url = 'https://api.openai.com/v1/chat';
    const body = { messages: [{ role: 'user', content: 'test' }] };
    
    const key1 = await generateStableKey(url, 'POST', body);
    const key2 = await generateStableKey(url, 'POST', body);
    
    expect(key1).toBe(key2);
    expect(key1?.length).toBeGreaterThan(32); // SHA-256 hex is 64 chars
  });

  it('filters out noise and ensures hash stability using intelligent strategy', async () => {
    const url = 'https://api.openai.com/v1/chat';
    const body1 = { model: 'gpt-4', messages: [], stream: true, temperature: 0.5 };
    const body2 = { model: 'gpt-4', messages: [], stream: false, temperature: 0.7, top_p: 1.0 };
    
    // With 'intelligent' strategy, noisy params are ignored
    const key1 = await generateStableKey(url, 'POST', body1, 'intelligent');
    const key2 = await generateStableKey(url, 'POST', body2, 'intelligent');
    expect(key1).toBe(key2);

    // With 'exact' strategy, they result in different keys
    const keyExact1 = await generateStableKey(url, 'POST', body1, 'exact');
    const keyExact2 = await generateStableKey(url, 'POST', body2, 'exact');
    expect(keyExact1).not.toBe(keyExact2);
  });

  it('falls back to node crypto when globalThis.crypto is unavailable', async () => {
    // Hide WebCrypto temporarily
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });

    const key = await generateStableKey('https://api.openai.com', 'POST', 'fallback test');
    expect(key).toBeTruthy();
    expect(key?.length).toBe(64); // Node crypto also outputs 64 hex SHA-256
    
    Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
  });

  it('falls back to fnv1a if web crypto and node crypto completely fail', async () => {
    const originalCrypto = globalThis.crypto;
    const originalProcess = globalThis.process;
    
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    // Simulate pure browser with absolutely NO node environment for node fallback
    Object.defineProperty(globalThis, 'process', { value: { release: { name: 'unknown' } }, configurable: true });

    const key = await generateStableKey('https://api.openai.com', 'POST', 'ultimate fallback test');
    expect(key).toBeTruthy();
    expect(key?.length).toBeLessThan(10); // fnv1a yields an 8 char hex typically
    
    Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
    Object.defineProperty(globalThis, 'process', { value: originalProcess, configurable: true });
  });
});

describe('Key Normalizer (Multi-Provider Endpoints)', () => {
  it('generates stable keys for Anthropic API calls', async () => {
    const url = 'https://api.anthropic.com/v1/messages';
    const body = { model: 'claude-3-opus', messages: [{ role: 'user', content: 'hello' }], system: 'You are helpful.' };
    
    const key1 = await generateStableKey(url, 'POST', body, 'intelligent');
    const key2 = await generateStableKey(url, 'POST', { ...body, max_tokens: 1024, temperature: 0.9 }, 'intelligent');
    
    // intelligent strategy keeps model, messages, system — ignores max_tokens, temperature
    expect(key1).toBe(key2);
  });

  it('generates stable keys for DeepSeek API calls', async () => {
    const url = 'https://api.deepseek.com/chat/completions';
    const body = { model: 'deepseek-chat', messages: [{ role: 'user', content: 'test' }] };
    
    const key1 = await generateStableKey(url, 'POST', body, 'intelligent');
    const key2 = await generateStableKey(url, 'POST', { ...body, stream: true, frequency_penalty: 0.2 }, 'intelligent');
    
    expect(key1).toBe(key2);
  });

  it('generates stable keys for Google Gemini API calls', async () => {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
    const body = { contents: [{ parts: [{ text: 'Explain quantum computing' }] }] };
    
    const key1 = await generateStableKey(url, 'POST', body, 'intelligent');
    const key2 = await generateStableKey(url, 'POST', { ...body, generationConfig: { temperature: 0.5 } }, 'intelligent');
    
    // contents is a whitelisted field; generationConfig is noise
    expect(key1).toBe(key2);
  });

  it('generates stable keys for Cohere API calls', async () => {
    const url = 'https://api.cohere.ai/v1/chat';
    const body = { model: 'command-r-plus', message: 'Hello from Cohere' };
    
    const key1 = await generateStableKey(url, 'POST', body, 'intelligent');
    const key2 = await generateStableKey(url, 'POST', { ...body, temperature: 0.3, preamble: 'Be concise.' }, 'intelligent');
    
    // model and message are whitelisted; temperature and preamble are noise
    expect(key1).toBe(key2);
  });

  it('generates stable keys for Mistral API calls', async () => {
    const url = 'https://api.mistral.ai/v1/chat/completions';
    const body = { model: 'mistral-large-latest', messages: [{ role: 'user', content: 'high five' }] };
    
    const key1 = await generateStableKey(url, 'POST', body, 'intelligent');
    const key2 = await generateStableKey(url, 'POST', { ...body, top_p: 0.9, safe_prompt: true }, 'intelligent');
    
    expect(key1).toBe(key2);
  });

  it('produces DIFFERENT keys for different models on the same endpoint', async () => {
    const url = 'https://api.openai.com/v1/chat/completions';
    const body1 = { model: 'gpt-4', messages: [{ role: 'user', content: 'test' }] };
    const body2 = { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'test' }] };

    const key1 = await generateStableKey(url, 'POST', body1, 'intelligent');
    const key2 = await generateStableKey(url, 'POST', body2, 'intelligent');

    expect(key1).not.toBe(key2);
  });

  it('produces DIFFERENT keys for different prompts on the same model', async () => {
    const url = 'https://api.anthropic.com/v1/messages';
    const body1 = { model: 'claude-3-opus', messages: [{ role: 'user', content: 'Hello' }] };
    const body2 = { model: 'claude-3-opus', messages: [{ role: 'user', content: 'Goodbye' }] };

    const key1 = await generateStableKey(url, 'POST', body1, 'intelligent');
    const key2 = await generateStableKey(url, 'POST', body2, 'intelligent');

    expect(key1).not.toBe(key2);
  });
  it('produces DIFFERENT keys when response_format changes (semantic clustering)', async () => {
    const url = 'https://api.openai.com/v1/chat/completions';
    const body1 = { model: 'gpt-4', messages: [], response_format: { type: 'json_object' } };
    const body2 = { model: 'gpt-4', messages: [], response_format: { type: 'text' } };

    const key1 = await generateStableKey(url, 'POST', body1, 'intelligent');
    const key2 = await generateStableKey(url, 'POST', body2, 'intelligent');

    expect(key1).not.toBe(key2);
  });
});

describe('Key Normalizer (Edge Cases)', () => {
  it('handles null/undefined body gracefully', async () => {
    const key1 = await generateStableKey('https://api.openai.com', 'GET');
    const key2 = await generateStableKey('https://api.openai.com', 'GET', null);
    const key3 = await generateStableKey('https://api.openai.com', 'GET', undefined);
    
    expect(key1).toBeTruthy();
    // null, undefined, and missing body should all produce the same key for same URL/method
    expect(key1).toBe(key2);
    expect(key1).toBe(key3);
  });

  it('handles non-JSON string body as raw text', async () => {
    const key = await generateStableKey('https://api.openai.com', 'POST', 'plain text body');
    expect(key).toBeTruthy();
    expect(key?.length).toBeGreaterThan(10);
  });

  it('handles JSON string body by parsing it', async () => {
    const objBody = { model: 'gpt-4', messages: [] };
    const strBody = JSON.stringify(objBody);
    
    const key1 = await generateStableKey('https://api.openai.com', 'POST', objBody, 'exact');
    const key2 = await generateStableKey('https://api.openai.com', 'POST', strBody, 'exact');
    
    // JSON string gets parsed and deep-sorted identically to the object
    expect(key1).toBe(key2);
  });

  it('accepts a custom key strategy function', async () => {
    const customStrategy = (url: string, method: string, body: Record<string, unknown>) => {
      // Only use the model field
      return { model: body?.model };
    };

    const body1 = { model: 'gpt-4', messages: [{ role: 'user', content: 'a' }] };
    const body2 = { model: 'gpt-4', messages: [{ role: 'user', content: 'b' }] };
    
    const key1 = await generateStableKey('https://api.openai.com', 'POST', body1, customStrategy);
    const key2 = await generateStableKey('https://api.openai.com', 'POST', body2, customStrategy);

    // Custom strategy ignores messages, only model matters
    expect(key1).toBe(key2);
  });

  it('intelligent strategy falls back to full body when no whitelisted fields exist', async () => {
    const body = { arbitrary: 'data', random_field: 123 };
    
    const key1 = await generateStableKey('https://api.openai.com', 'POST', body, 'intelligent');
    const key2 = await generateStableKey('https://api.openai.com', 'POST', { ...body, extra: true }, 'intelligent');
    
    // No whitelisted fields found → falls back to full body → different keys
    expect(key1).not.toBe(key2);
  });

  it('deepSortKeys correctly sorts nested arrays and objects', () => {
    const input = { z: [{ b: 2, a: 1 }, { d: 4, c: 3 }], y: 'test' };
    const sorted = deepSortKeys(input);
    
    expect(Object.keys(sorted)).toEqual(['y', 'z']);
    expect(Object.keys(sorted.z[0])).toEqual(['a', 'b']);
    expect(Object.keys(sorted.z[1])).toEqual(['c', 'd']);
  });

  it('deepSortKeys passes through primitive values unchanged', () => {
    expect(deepSortKeys('hello')).toBe('hello');
    expect(deepSortKeys(42)).toBe(42);
    expect(deepSortKeys(null)).toBe(null);
    expect(deepSortKeys(true)).toBe(true);
  });

  it('INTELLIGENT_KEY_FIELDS contains all expected AI model fields', () => {
    expect(INTELLIGENT_KEY_FIELDS).toContain('model');
    expect(INTELLIGENT_KEY_FIELDS).toContain('messages');
    expect(INTELLIGENT_KEY_FIELDS).toContain('prompt');
    expect(INTELLIGENT_KEY_FIELDS).toContain('system');
    expect(INTELLIGENT_KEY_FIELDS).toContain('contents');
    expect(INTELLIGENT_KEY_FIELDS).toContain('message');
    expect(INTELLIGENT_KEY_FIELDS).toContain('response_format');
  });

  it('produces different keys for different URLs with same body', async () => {
    const body = { model: 'gpt-4', messages: [] };
    const key1 = await generateStableKey('https://api.openai.com/v1/chat', 'POST', body);
    const key2 = await generateStableKey('https://api.anthropic.com/v1/messages', 'POST', body);
    
    expect(key1).not.toBe(key2);
  });

  it('produces different keys for different HTTP methods with same URL', async () => {
    const key1 = await generateStableKey('https://api.openai.com/v1/models', 'GET');
    const key2 = await generateStableKey('https://api.openai.com/v1/models', 'POST');
    
    expect(key1).not.toBe(key2);
  });
});
