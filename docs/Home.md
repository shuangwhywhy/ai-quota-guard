# Welcome to AI Quota Guard Docs

**AI Quota Guard** is the "Optimal Balance" development firewall for AI-native engineering. It operates at the network layer to shield your API budget and engineering focus from framework-induced noise without staining your codebase or introducing infrastructure overhead.

---

## ⚖️ The Optimal Balance

AI Quota Guard is built on the belief that developer safety shouldn't come at the cost of architectural complexity. We solve the 7 core pain points of modern AI development:

1.  **Zero-Intrusive Adoption**: Plug-and-play as a transparent wrapper. No SDK swaps, no logic pollution, and zero footprint in your business code.
2.  **Universal Compatibility**: Framework-agnostic at its core. Whether it's Next.js, Vite, or a raw Node server, one command (`npx qg`) covers every stack with zero per-project adapters.
3.  **Intelligent Guarding, Not "Dumb Mocks"**: The perfect middle ground. It silences framework noise (HMR, re-renders) but allows real requests when you need them. Debug with mock speed and LLM truth.
4.  **Zero Infrastructure Burden**: No local proxy servers, no Docker containers, and no extra processes. A lightweight, in-process engine that adds zero system pressure.
5.  **Production-Hardened Safety**: Built-in environment isolation. The guard is physically incapable of active interception in production, eliminating all risk of leakage.
6.  **Team-Scale Portability**: Seamlessly portable across environments. Config is project-scoped and versioned—new team members are "protected" the moment they `git clone`.
7.  **Controlled Flexibility**: Break-glass escape hatches are standard. Break default limits for critical truth-seeking requests without dismantling your safety net.

---

## 🚧 What this is NOT

To maintain its "Zero-Intrusive" promise and developer-first focus, Quota Guard is strictly bounded:
- **NOT for Production**: It is physically bypassed in production via environment checks. It is NOT for high-concurrency traffic governance or routing.
- **NOT a Gateway**: It does NOT require endpoint changes or a centralized proxy server. It is NOT for managing team-wide API keys or logs.
- **NOT a Code-Staining SDK**: It does NOT force you to use custom wrappers or inject logic into your functional code.
- **NOT a Provider-side Cache**: It does NOT replace prompt caching from providers; it is an additive layer that stops redundant IDE/Framework noise before it leaves your machine.

---

## 🛡️ The Firewall Philosophy

Unlike traditional AI gateways or observability platforms, Quota Guard focuses exclusively on the **Individual Developer Loop**. It is a safety fuse that ensures Vite HMR, React StrictMode, or accidental loops never burn your project's quota.

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
