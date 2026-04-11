# Overview

**Quota Guard** (`@shuangwhywhy/quota-guard`) is a zero-intrusive engine designed to optimize AI application performance and stability. It achieves this through intelligent deduplication, caching, and guardrails.

## The Core Philosophy: "Zero-Intrusion"

Unlike traditional SDK wrappers or monkey-patching libraries, Quota Guard functions as a **purely passive, transparent network observer**. 

- **No Code Changes**: You don't need to change how you call OpenAI, Anthropic, or any other provider.
- **Library Agnostic**: It works whether you use `axios`, `window.fetch`, `XMLHttpRequest`, or the official SDKs.
- **Native Hooking**: It intercepts network traffic at the lowest possible layer (Node.js `http/https` modules or Browser network stacks).

## Why Use Quota Guard?

During development and testing, AI interactions can be costly and fragile. Quota Guard solves several common pain points:

### 🏦 Budget Safety (Cost Savings)
Repetitive debugging often involves sending the same prompts over and over. Quota Guard's intelligent caching ensures you only pay for the first prompt. Identical subsequent prompts are served instantly from your local cache.

### 🚀 Developer Velocity
By deduplicating parallel in-flight requests (e.g., caused by an accidental double React render), Quota Guard reduces the load on your AI providers and makes your application feel significantly more responsive.

### 🛡️ Reliability (Circuit Breakers)
AI APIs can be unstable or subject to heavy rate limiting. Quota Guard's built-in circuit breakers protect your application from cascading failures. If a provider starts failing, the guard opens, preventing further wasted calls and protecting your user experience.

### 🍱 Standardized Observability
All guarded requests are injected with `X-Quota-Guard` response headers (`HIT`, `SHARED`, `LIVE`), giving you instant visibility in your browser's Network tab or terminal logs without adding complex logging to your business logic.
