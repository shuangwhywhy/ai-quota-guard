# 🛡️ AI Quota Guard

> **The Zero-Intrusive Firewall for AI Development.**
> Stop wasting tokens on hot-reloads, React re-renders, and accidental loops without touching a single line of business logic.

[![NPM Version](https://img.shields.io/npm/v/@shuangwhywhy/quota-guard.svg)](https://www.npmjs.com/package/@shuangwhywhy/quota-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

### ⚖️ The Optimal Balance for AI Development

Quota Guard is the only development-time AI firewall that achieves the **"Perfect Balance"** between developer productivity, cost control, and architectural purity.

#### 🏗️ The 7 Pillars of the Guard
1.  **Zero-Intrusive Adoption**: Plug-and-play as a transparent wrapper. No SDK swaps, no logic pollution, and zero footprint in your business code.
2.  **Universal Compatibility**: Framework-agnostic at its core. Whether it's Next.js, Vite, or a raw Node server, one command (`npx qg`) covers every stack with zero per-project adapters.
3.  **Intelligent Guarding, Not "Dumb Mocks"**: The middle ground. It silences framework noise (HMR, re-renders) but allows real requests when you need them. Debug with mock speed and LLM truth.
4.  **Zero Infrastructure Burden**: No local proxy servers, no Docker containers, and no extra processes. A lightweight, in-process engine that adds zero system pressure.
5.  **Production-Hardened Safety**: Built-in environment isolation. The guard is physically incapable of active interception in production, eliminating all risk of leakage.
6.  **Team-Scale Portability**: Seamlessly portable across environments. Config is project-scoped and versioned—new team members are "protected" the moment they `git clone`.
7.  **Controlled Flexibility**: Break-glass escape hatches are standard. Break default limits for critical truth-seeking requests without dismantling your safety net.

---

### 🚧 What this is NOT

To maintain its "Zero-Intrusive" promise and developer-first focus, Quota Guard is strictly bounded:
- **NOT for Production**: It is physically bypassed in production via environment checks. It is NOT for high-concurrency traffic governance or routing.
- **NOT a Gateway**: It does NOT require endpoint changes or a centralized proxy server. It is NOT for managing team-wide API keys or logs.
- **NOT a Code-Staining SDK**: It does NOT force you to use custom wrappers or inject logic into your functional code.
- **NOT a Provider-side Cache**: It does NOT replace prompt caching from providers; it is an additive layer that stops redundant IDE/Framework noise before it leaves your machine.

---

### ❓ Why Quota Guard?

Modern AI development is noisy and expensive. Framework artifacts like **Vite HMR** and **React StrictMode** can trigger hundreds of redundant LLM API calls during a single debug session. One logic error in a loop can drain a weekly quota in minutes.

Existing solutions forced a trade-off:
- **Production Gateways** are too heavy and ignore dev-server noise.
- **Provider Caching** doesn't stop accidental loops or redundant IDE-induced calls.
- **Manual Mocking** creates brittle, code-staining `if (dev)` blocks that are hard to scale.

**Quota Guard is the only solution that protects your budget without touching your code or adding infrastructure.**

### 🚀 Quick Start

The most flexible way to use Quota Guard is via its **Framework-Agnostic** CLI.

#### 1. Unified CLI (Recommended for Node.js)
Works with ANY framework (Next.js, NestJS, Nuxt, Vite, etc.) by wrapping your command.

```bash
# Initialize config (once)
npx qg init

# Wrap your dev server
npx qg npm run dev
npx qg next dev
npx qg dev             # If "dev" is in your package.json
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
| **Env Safety** | **Strict (Auto-Bypass)** | No | Limited | No | Manual |
| **Infra Burden** | **Zero (In-Process)** | Zero | High (Proxy/Docker) | Medium (Client) | Zero |

---

### 🧠 How it Works

Powered by `@mswjs/interceptors`, Quota Guard captures `fetch`, `XMLHttpRequest`, and Node.js `http`/`https` calls at the kernel level.

- **Deduplication**: Uses a custom `ResponseBroadcaster` to "tee" AI streams. Deduplicated requests receive identical stream chunks in real-time.
- **Provider Intelligence**: Auto-detects major providers (OpenAI, Anthropic, Gemini, DeepSeek, etc.) to extract semantic fields for cache keys.
- **6-Level Config**: Settings merge from CLI args, Env Vars, `.quotaguardrc.ts`, and project defaults.

---

### ⚖️ License
MIT © qyz
