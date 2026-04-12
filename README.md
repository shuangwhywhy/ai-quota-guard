# 🛡️ AI Quota Guard

> **The Zero-Intrusive Firewall for AI Development.**
> Stop wasting tokens on hot-reloads, React re-renders, and accidental loops without touching a single line of business logic.

[![NPM Version](https://img.shields.io/npm/v/@shuangwhywhy/quota-guard.svg)](https://www.npmjs.com/package/@shuangwhywhy/quota-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

### ❓ Why Quota Guard?

Modern AI development is **noisy** and **expensive**. During a typical debug session, framework artifacts like **Vite HMR**, **React StrictMode**, and component re-renders can trigger hundreds of redundant LLM API calls. A single logic error in a loop can drain your team's weekly quota in minutes.

**Quota Guard is a zero-intrusion protection layer for your development-time AI request cycle.** It shields your budget from requests that are functionally required to run your code, but aren't worth a real-world API cost during iterative debugging. 

**No SDK wrappers. No endpoint changes. No code pollution.**

---

### ✨ Key Capabilities

*   **🛡️ Runtime Firewall**: Intercepts and guards LLM requests at the source, preventing budget-draining noise.
*   **⚡ Zero-Intrusion**: Works via runtime injection. No SDK wrappers, no endpoint changes, no code pollution.
*   **🔄 Stream Deduplication**: Intelligently merges concurrent identical requests while maintaining real-time streaming feedback.
*   **🧨 Circuit Breaker**: Proactively stops infinite loops and accidental retry storms to protect your shared quotas.
*   **📂 Local-First Persistence**: Persists expensive AI responses locally to speed up repetitive debugging and save costs.

---

### 🚫 Why existing solutions are not enough?

- **Production Gateways** (like LiteLLM or Portkey) are designed for high-concurrency and multi-tenancy. They are too heavy for local development and don't understand the "noise" of a hot-reloading DevServer.
- **Native Prompt Caching** is a great way to save money on stable prompts, but it doesn't stop accidental infinite loops or redundant calls from your UI framework during active coding.
- **Manual Mocking** clutters your business logic with environment-aware `if` statements and static JSON files that are brittle and hard to maintain.

---

### 🚀 Quick Start

The most flexible way to use Quota Guard is via its **Framework-Agnostic** CLI.

#### 1. Unified CLI (Recommended for Node.js)
Works with ANY framework (Next.js, NestJS, Nuxt, Vite, etc.) by wrapping your command.

```bash
# Initialize config (once)
npx qg init

# Wrap your dev server
npx qg run npm run dev
npx qg run npx next dev
```

#### 2. Manual Registration (Frontend/Bundlers)
For non-Vite projects or if you prefer explicit code injection, add this to the very top of your application entry point (e.g., `main.ts` or `app/layout.tsx`).

```typescript
import '@shuangwhywhy/quota-guard/register';
```

#### 3. Vite Plugin (Convenience)
```typescript
import { quotaGuardPlugin } from '@shuangwhywhy/quota-guard/vite';

export default {
  plugins: [quotaGuardPlugin()]
};
```

---

### 📖 Use Cases

#### 1. The HMR & StrictMode Multiplier
React `StrictMode` and Vite HMR often cause components to mount twice or re-trigger effects. Quota Guard catches these at the network level. No matter how many times your component refreshes, identical prompts within a short window only cost you **one** request.

#### 2. Workflow-First Debugging
When debugging a long business chain (e.g., *Analyze Text -> Save DB -> Send Email*), you rarely care about the AI's creative output quality. Quota Guard caches the response locally so you can iterate on your business logic 100 times while only hitting the API once.

#### 3. The Infinite Loop Fuse
Writing an Agent loop or a tricky `useEffect`? One hand-off error can trigger a loop that burns $50 in seconds. Quota Guard's built-in **Circuit Breaker** detects these patterns and trips the fuse before your quota is gone.

#### 4. Total Environment Isolation
Keep your debug logic out of your production bundle. Because we use network-level interception, there's no `if (process.env.DEV)` scattered through your business code.

---

### ⚖️ Comparison

To understand the ecosystem:
- **Native Prompt Caching**: Provider-side cost/performance reuse for stable prompts.
- **AI Gateways**: Production-grade routing, logging, and centralized governance.
- **Semantic Caches**: Shared response reuse based on similarity retrieval.
- **Manual Mocks**: Hard-to-maintain mocks that often pollute business logic.
- **Quota Guard**: Development-time protection against meaningless or redundant AI calls.

It is **additive** to production tools, not a replacement for them.

| Dimension | **AI Quota Guard** | Native Prompt Caching | AI Gateways | Semantic Cache | Manual Mocking |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Goal** | **Dev-time Guard** | Cost / Performance | Governance / Proxy | Similarity Reuse | One-off Testing |
| **Intrusion** | **Zero (CLI / Runtime)** | Low (Arg change) | High (Endpoint change) | High (SDK change) | High (Code changes) |
| **Dev Focus** | **Yes (Exclusive)** | No | No | No | Partial |
| **Loop Protection**| **Active Fuse** | No | Basic Rate Limit | No | No |
| **HMR Deduplication**| **Yes (Native)** | No | No | No | Manual |

---

### 🧠 How it Works

Powered by `@mswjs/interceptors`, Quota Guard captures `fetch`, `XMLHttpRequest`, and Node.js `http`/`https` calls at the kernel level.

- **Deduplication**: Uses a custom `ResponseBroadcaster` to "tee" AI streams. Deduplicated requests receive identical stream chunks in real-time.
- **Provider Intelligence**: Auto-detects major providers (OpenAI, Anthropic, Gemini, DeepSeek, etc.) to extract semantic fields for cache keys.
- **6-Level Config**: Settings merge from CLI args, Env Vars, `.quotaguardrc.ts`, and project defaults.

---

### ⚖️ License
MIT © qyz
