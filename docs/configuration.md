# Configuration Guide

Quota Guard is designed to be highly configurable via a declarative object. It supports multiple formats (`.js`, `.ts`, `.json`, `.yaml`) and automatically discovers configuration files in your project.

## 1. Discovery & Hierarchy (The 5-Level Strategy)

Quota Guard searches for configuration in the following order of priority (1 = highest):

| Level | Priority | Type | Description |
| :--- | :--- | :--- | :--- |
| **1** | **Highest** | **Code** | Passed directly to `injectQuotaGuard({...})`. |
| **2** | **Project Root** | **Config File** | `.quotaguardrc.[ext]` in the current working directory. |
| **3** | **Internal Dir** | **Project Spec** | `.quota-guard/config.[ext]` inside the repository. |
| **4** | **Global** | **User Home** | `~/.quotaguardrc.[ext]` for system-wide defaults. |
| **5** | **Lowest** | **Embedded** | Built-in fallback settings. |

---

## 2. Options Reference

### `enabled`
- **Type**: `boolean`
- **Default**: `true` in development, `false` in production.
- **Description**: Master switch. If false, all network traffic passes through untouched.

### `aiEndpoints`
- **Type**: `(string | RegExp)[]`
- **Default**: Covers OpenAI, Anthropic, Gemini, DeepSeek, etc. (See [registry.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/providers/registry.ts))
- **Description**: A list of hostnames to intercept. Use regex for local proxies like `localhost:11434`.

### `cacheTtlMs`
- **Type**: `number`
- **Default**: `3600000` (1 Hour)
- **Description**: How long to keep a successful AI response in the local cache.

### `debounceMs`
- **Type**: `number`
- **Default**: `300`
- **Description**: The "Gathering Window". If two identical requests occur within this window, the second one will wait and share the result of the first, instead of hitting the network.

### `breakerMaxFailures`
- **Type**: `number`
- **Default**: `3`
- **Description**: Consecutive failures (non-OK status) allowed for a **specific request fingerprint** before blocking further attempts.

### `globalBreakerMaxFailures`
- **Type**: `number`
- **Default**: `10`
- **Description**: Total consecutive failures allowed across **all requests** before entering a "Panic Mode" and blocking all AI traffic.

### `keyHeaders`
- **Type**: `string[]`
- **Default**: `[]`
- **Description**: List of headers (e.g., `X-User-Id`) that should be included when generating the request fingerprint. Use this if your AI results vary based on user identity.

### `intelligentFields`
- **Type**: `string[]`
- **Default**: `['model', 'messages', 'prompt', ...]`
- **Description**: Fields extracted from the request body to generate the cache key. This ignores noise like `temperature`, ensuring `temperature: 0.7` and `temperature: 0.8` share the same cache for identical prompts.

---

## 3. Rules (Granular Overrides)

The `rules` array allows you to define specific behaviors for certain endpoints.

```typescript
{
  rules: [
    {
      match: {
        url: /gpt-4-vision/, // Regex match
        headers: { 'X-Priority': 'High' }
      },
      override: {
        cacheTtlMs: 0,   // Never cache vision requests
        debounceMs: 1000 // But deduplicate them aggressively
      }
    }
  ]
}
```
