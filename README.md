# AI Quota Guard

[![NPM Version](https://img.shields.io/npm/v/@shuangwhywhy/quota-guard.svg)](https://www.npmjs.com/package/@shuangwhywhy/quota-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **The Zero-Intrusive Engine for AI Cost Savings & Stability.**
> Automatically deduplicate, cache, and guard your LLM calls without changing a single line of business logic.

---

## 📖 Documentation

The most comprehensive documentation is available through our **[GitHub Wiki](https://github.com/shuangwhywhy/ai-quota-guard/wiki)**.

---

## ⚡️ Why Quota Guard?

During development, UI re-renders, automatic effects, and repetitive debugging sessions can cause hundreds of identical LLM API calls. This leads to blown budgets, rate-limiting (`429 Too Many Requests`), and interrupted development.

AI Quota Guard is a **zero-preference, zero-intrusion engine** that seamlessly intercepts network calls — specifically those bound for AI endpoints.

- **🏦 Save Money**: Intelligent caching eliminates costs for identical prompts across sessions.
- **🚀 Faster DX**: In-flight deduplication and aggregation make your app feel snappier.
- **🛡️ Safety First**: Per-key and Global Circuit Breakers stop infinite loops from nuking your API quota.
- **🔌 Zero-Intrusion**: Works with ANY SDK (OpenAI, LangChain, etc.) via native global interception.

---

## 🚀 Quick Start

The most flexible way to use Quota Guard is via its **Framework-Agnostic** CLI or direct import.

### 1. Unified CLI (Recommended for Node.js)

Works with ANY framework (Next.js, NestJS, Nuxt, Vite, etc.) by wrapping your command.

```bash
# Initialize config (once)
npx qg init

# Wrap your dev server
npx qg run npm run dev
npx qg run npx next dev
```

### 2. Manual Registration (Frontend/Bundlers)

For non-Vite projects or if you prefer explicit code injection, add this to the very top of your application entry point (e.g., `main.ts` or `app/layout.tsx`).

```typescript
import '@shuangwhywhy/quota-guard/register';
```

### 3. Vite Plugin (Convenience)

You can still use the dedicated plugin if preferred.

```typescript
import { quotaGuardPlugin } from '@shuangwhywhy/quota-guard/vite';

export default {
  plugins: [quotaGuardPlugin()]
};
```

---

## ⚙️ Configuration (The 6-Level Hierarchy)

Quota Guard uses a multi-layered configuration system. Settings merge from lowest to highest priority (Level 1 wins):

1.  **Code**: `injectQuotaGuard({...})` or Vite plugin options.
2.  **Env Var JSON**: `QUOTA_GUARD_CONFIG` (set by `qg run`).
3.  **Env File**: `.quotaguardrc.[envName].ts`
4.  **Project Base**: `.quotaguardrc.ts` or `package.json`.
5.  **Global**: `window.__QUOTA_GUARD_CONFIG__` (Browser fallback).
6.  **Defaults**: Internal sensible defaults (Absolute fallback).

---

## 🔍 Observability & Verification
---

## 🛠 Command Line Interface (CLI)

```bash
# Initialize a template configuration file (.quotaguardrc.json)
npx qg init

# Check installed version
npx qg version
```

---

## 🧠 How It Works

- **Network Coverage**: Powered by `@mswjs/interceptors`. Covers `fetch`, `XMLHttpRequest`, and Node.js `http`/`https` modules natively across Node and Browser.
- **Real-time Streaming**: Uses a custom `ResponseBroadcaster` to "tee" AI streams. Deduplicated requests receive identical stream chunks simultaneously in real-time.
- **Provider Intelligence**: Auto-detects major providers (OpenAI, Anthropic, Gemini, DeepSeek, etc.) to extract exact semantic fields.

---

## ⚖️ License
MIT © qyz
