# Welcome to AI Quota Guard Docs

**AI Quota Guard** is the zero-intrusion development firewall for AI-native applications. It sits at the network layer to protect your API budget and engineering sanity during the development and debugging cycle.

---

## 🛡️ The Firewall Philosophy

Quota Guard is the "surge protector" for AI developers. 

Unlike traditional SDK wrappers or observability platforms, we focus on the **individual developer loop**. Crucially, Quota Guard is built for development-time protection, not production-time optimization. We ensure that framework-induced requests — like those caused by HMR or re-rendering — never hit your API balance.

- **Zero-Intrusion**: No code changes. No SDK wrappers. Just plug and play.
- **Budget Protection**: Save tokens from hot-reloads, re-renders, and "noise."
- **Safety First**: Built-in "fuses" (Circuit Breakers) to stop accidental loops.
- **Developer Focus**: Use real SDKs with the speed and cost of local mocks.

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
