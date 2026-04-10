# Quota Guard Examples

This directory contains various ways to integrate and test Quota Guard in different environments.

## 🚀 Browser Demos

### 1. [Vite Modern Demo](./vite-demo) 
A full [Vite](https://vitejs.dev/) project demonstrating:
- Real-world bundling.
- Stream broadcasting synchronization.
- Automatic configuration injection via `window.__QUOTA_GUARD_CONFIG__`.
- Multi-subscriber parity.

Run with: `cd vite-demo && npm install && npm run dev`

### 2. [Simple Browser Hook](./browser-simple/index.html)
A single HTML file showing manual injection using ES Modules. Ideal for seeing the raw `injectQuotaGuard` call.

## 💻 Node.js Demos

### 1. [Simple Node Hook](./node-simple/example.ts)
Demonstrates using the global fetch interceptor in a Node.js environment to deduplicate AI calls.

---

## 🧪 Automated Verification

To run automated tests in a real browser context (Playwright):
`npm run test:browser`
