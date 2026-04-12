# Welcome to AI Quota Guard Docs

**AI Quota Guard** is the zero-intrusion development firewall for AI-native applications. It sits at the network layer to protect your API budget and engineering sanity during the development and debugging cycle.

---

## 🛡️ The Firewall Philosophy

Unlike traditional SDK wrappers or observability platforms, Quota Guard functions as an **invisible, passive network guardrail**. We believe that your development cycle should be fearless:

- **Zero-Intrusion**: No code changes. No SDK wrappers. Just plug and play.
- **Budget Protection**: Save tokens from hot-reloads, re-renders, and "noise."
- **Safety First**: Built-in fuses (Circuit Breakers) to stop accidental infinite loops.
- **Local Fidelity**: Use real SDKs and real providers with the efficiency of local mocks.

---

## 🚀 Learning Paths

- **[Getting Started](./getting-started.md)**: Jump from 0 to 1 with Node.js and Frontend integrations.
- **[Core Scenarios](./scenarios.md)**: Deep dive into HMR protection, workflow debugging, and infinite loop prevention.
- **[Configuration Guide](./configuration.md)**: Master the 6-level configuration hierarchy.
- **[Advanced Setup](./advanced.md)**: Custom interceptors, stream broadcasting, and complex key generation.
- **[API Reference](./api.md)**: Detailed types and function signatures for power users.

---

## 💎 Core Principles

### 1. Zero-Intrusion
Protect your budget without staining your codebase. Quota Guard intercepts `fetch`, `XHR`, and `http.request` globally at the runtime level.

### 2. Intelligent Deduplication
By semantically analyzing request bodies, we merge identical in-flight prompts—especially those triggered by framework artifacts like React StrictMode or HMR.

### 3. Circuit Breaking
The "Fuse Box" for your development environment. If your code starts a recursive loop or a retry storm, the guard opens, killing the requests before they burn your quota.

### 4. Visibility (Zero-Logging)
All guarded requests are injected with `X-Quota-Guard` response headers (`HIT`, `SHARED`, `LIVE`). Get instant visibility in your browser's Network tab or terminal logs without adding a single line of `console.log` to your business logic.

---

## 🛠 Active Maintenance

The source for this documentation is managed directly in our repository under the `docs/` folder and synchronized automatically to the GitHub Wiki.
