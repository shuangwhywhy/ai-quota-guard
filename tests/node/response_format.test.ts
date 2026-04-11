import { describe, it, expect } from 'vitest';
import { generateStableKey } from '../../src/keys/normalizer';

describe('Response Format Cache Invalidation', () => {
  it('produces DIFFERENT keys for different response_format in OpenAI', async () => {
    const url = 'https://api.openai.com/v1/chat/completions';
    const baseBody = { 
      model: 'gpt-4o', 
      messages: [{ role: 'user', content: 'test' }] 
    };
    
    const body1 = { ...baseBody, response_format: { type: 'text' } };
    const body2 = { ...baseBody, response_format: { type: 'json_object' } };

    const key1 = await generateStableKey(url, 'POST', body1, 'intelligent');
    const key2 = await generateStableKey(url, 'POST', body2, 'intelligent');

    expect(key1).not.toBe(key2);
  });

  it('produces DIFFERENT keys for different response_format in DeepSeek', async () => {
    const url = 'https://api.deepseek.com/chat/completions';
    const baseBody = { 
      model: 'deepseek-chat', 
      messages: [{ role: 'user', content: 'test' }] 
    };
    
    const body1 = { ...baseBody, response_format: { type: 'text' } };
    const body2 = { ...baseBody, response_format: { type: 'json_object' } };

    const key1 = await generateStableKey(url, 'POST', body1, 'intelligent');
    const key2 = await generateStableKey(url, 'POST', body2, 'intelligent');

    expect(key1).not.toBe(key2);
  });

  it('produces DIFFERENT keys for different response_format via generic fields', async () => {
    // Custom provider or generic fallback
    const url = 'https://my-custom-ai.com/v1/completions';
    const baseBody = { 
      prompt: 'test' 
    };
    
    const body1 = { ...baseBody, response_format: 'text' };
    const body2 = { ...baseBody, response_format: 'json' };

    const key1 = await generateStableKey(url, 'POST', body1, 'intelligent');
    const key2 = await generateStableKey(url, 'POST', body2, 'intelligent');

    expect(key1).not.toBe(key2);
  });
});
