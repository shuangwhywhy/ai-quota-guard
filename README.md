# AI Quota Guard

[![NPM Version](https://img.shields.io/npm/v/@shuangwhywhy/quota-guard.svg)](https://www.npmjs.com/package/@shuangwhywhy/quota-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **The Zero-Intrusive Engine for AI Cost Savings & Stability.**
> Automatically deduplicate, cache, and guard your LLM calls without changing a single line of business logic.

---

## 📖 Documentation

The most comprehensive documentation is available through our **Interactive Documentation Hub**. 

```bash
# Start the interactive documentation center
npx qg docs
```

Or view it [Locally](./docs/index.html) or via [GitHub Wiki](https://github.com/shuangwhywhy/ai-quota-guard/wiki).

---

## ⚡️ Why Quota Guard?

During development, UI re-renders, automatic effects, and repetitive debugging sessions can cause hundreds of identical LLM API calls. This leads to blown budgets, rate-limiting (`429 Too Many Requests`), and interrupted development high.

AI Quota Guard is a **zero-preference, zero-intrusion engine** that seamlessly intercepts network calls — specifically those bound for AI endpoints.

- **🏦 Save Money**: Intelligent caching eliminates costs for identical prompts across sessions.
- **🚀 Faster DX**: In-flight deduplication and aggregation make your app feel snappier.
- **🛡️ Safety First**: Per-key and Global Circuit Breakers stop infinite loops from nuking your API quota.
- **🔌 Zero-Intrusion**: Works with ANY SDK (OpenAI, LangChain, etc.) via native global interception.

---

## 🚀 Quick Start

### 1. Node.js (Backend)

Run your app with Quota Guard injected natively using standard Node flags.

```bash
# Node >= 20.6.0
NODE_ENV=development node --import @shuangwhywhy/quota-guard/register app.js
```

### 2. Vite (Frontend)

Add the plugin to your `vite.config.ts`.

```typescript
import { quotaGuardPlugin } from '@shuangwhywhy/quota-guard/vite';

export default {
  plugins: [quotaGuardPlugin()]
};
```

---

## ✅ Is It Working? (Active Signals)

Quota Guard provides clear signals to confirm it is active:

1.  **Startup Banner**: Look for the `[Quota Guard] READY` banner in your terminal or console.
2.  **Network Headers**: All guarded responses carry an `X-Quota-Guard` status in your **Network Tab** (`HIT`, `SHARED`, `LIVE`).

---

## 🛠 Command Line Interface (CLI)

```bash
# Initialize a template configuration file
npx qg init

# Open the documentation center
npx qg docs
```

---

## 🧠 How It Works

- **Network Coverage**: Powered by `@mswjs/interceptors`. Covers `fetch`, `XMLHttpRequest`, and Node.js `http`/`https` modules natively across Node and Browser.
- **Real-time Streaming**: Uses a custom `ResponseBroadcaster` to "tee" AI streams. Deduplicated requests receive identical stream chunks simultaneously in real-time.
- **Provider Intelligence**: Auto-detects major providers (OpenAI, Anthropic, Gemini, DeepSeek, etc.) to extract exact semantic fields.

---

## ⚖️ License
MIT © qyz
