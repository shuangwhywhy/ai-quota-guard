import { OpenAI } from 'openai';
// In documentation we show the user running `node --require quota-guard/register example.js`
// Here, we just manually inject it for demonstration so you can run it via `ts-node` or normal node without flags
import { injectQuotaGuard } from '../../src/setup';

injectQuotaGuard({
  enabled: true, // Force enable for testing
  cacheTtlMs: 5000, 
  auditHandler: (event) => console.log(`[AUDIT EVENT] -> ${event.type}: ${event.url}`)
});

const client = new OpenAI({ 
  apiKey: 'fake-api-key',
  // Mock endpoint to prevent real API hits in this example
  baseURL: 'https://api.openai.com/v1' 
});

async function main() {
  console.log('--- Firing First Request ---');
  try {
    // This will fail natively since API key is fake, but Quota Guard will emit "live_called" and "request_failed"
    await client.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  } catch {
    console.log('First request failed (expected with fake key).');
  }

  console.log('\n--- Firing Second Repeated Request ---');
  try {
    await client.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  } catch {
    console.log('Second request failed (expected with fake key).');
  }

  // To truly test the interceptor, run the vitest suites which mock the network fully!
  console.log('\nPlease run `npm run test` for fully mocked caching and deduplication examples!');
}

main();
