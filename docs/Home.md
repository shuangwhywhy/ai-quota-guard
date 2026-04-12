# Overview

**Quota Guard** (`@shuangwhywhy/quota-guard`) is a zero-intrusive engine designed to optimize AI application performance and stability. It achieves this through intelligent deduplication, caching, and guardrails.

## The Core Philosophy: "Zero-Intrusion"

Unlike traditional SDK wrappers or monkey-patching libraries, Quota Guard functions as a **purely passive, transparent network observer**. 

- **No Code Changes**: You don't need to change how you call OpenAI, Anthropic, or any other provider.
- **Library Agnostic**: It works whether you use `axios`, `window.fetch`, `XMLHttpRequest`, or the official SDKs.
- **Native Hooking**: It intercepts network traffic at the lowest possible layer (Node.js `http/https` modules or Browser network stacks).
# Welcome to AI Quota Guard Wiki

**AI Quota Guard** is your project's passive sentinel for AI stability and cost optimization. It sits directly at the network layer, ensuring your application remains safe from rate-limiting and budget overflows without requiring a single line of business logic change.

---

## 🚀 Key Learning Paths

- **[Getting Started](./getting-started.md)**: Jump from 0 to 1 with Node.js and Vite integrations.
- **[Configuration Guide](./configuration.md)**: Master the 5-layer configuration hierarchy.
- **[Advanced Scenarios](./scenarios.md)**: handle streaming deduplication, complex key generation, and circuit breaking.
- **[API Reference](./api.md)**: Detailed types and function signatures for power users.

---

## 🛡️ Core Principles

### 1. Zero-Intrusion
We believe you shouldn't have to change your LLM SDK code to protect your budget. Quota Guard intercepts `fetch`, `XHR`, and `http.request` globally.

### 2. Intelligent Deduping
By semantically analyzing request bodies, we merge identical in-flight prompts, saving massive costs during rapid UI development and debugging.

### 3. Safety Guardrails
Circuit breakers at both the request-level and process-level ensure that infinite loops or sudden provider failures don't drain your balance.

---

## 🛠 Active Maintenance

The source for this documentation is managed directly in our repository under the `docs/` folder and synchronized automatically to this Wiki.
tect your application from cascading failures. If a provider starts failing, the guard opens, preventing further wasted calls and protecting your user experience.

### 🍱 Standardized Observability
All guarded requests are injected with `X-Quota-Guard` response headers (`HIT`, `SHARED`, `LIVE`), giving you instant visibility in your browser's Network tab or terminal logs without adding complex logging to your business logic.
