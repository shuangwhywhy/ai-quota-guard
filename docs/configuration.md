# Configuration Guide

Quota Guard is designed to be highly configurable via a declarative object. It supports multiple formats (`.js`, `.ts`, `.json`, `.yaml`) and automatically discovers configuration files in your project.

## 1. Discovery & Hierarchy (The 6-Level Strategy)

Quota Guard searches for configuration in the following order of priority (1 = highest):

| Level | Priority | Type | Description |
| :--- | :--- | :--- | :--- |
| **1** | **Highest** | **Code** | Passed directly to `injectQuotaGuard({...})` or plugin options. |
| **2** | **Env Var** | **CLI/Env** | `QUOTA_GUARD_CONFIG` (JSON string). Automatically set by `qg run`. |
| **3** | **Env File** | **Project Root** | `.quotaguardrc.[envName].[ext]` (e.g., `.quotaguardrc.production.ts`) |
| **4** | **Project Base** | **Project Root** | `.quotaguardrc.[ext]` or `package.json` (via `quotaguard` key). |
| **5** | **Global** | **Browser Window** | `window.__QUOTA_GUARD_CONFIG__`. |
| **6** | **Lowest** | **Embedded** | Built-in fallback settings defined in the library. |

> [!TIP]
> Use `qg run <command>` to automatically load your local configuration files and inject them into the environment as a high-priority Level 2 override.

> [!NOTE]
> Environment-specific files (`Level 2`) are only loaded if `process.env.NODE_ENV` (or a custom env passed to the loader) matches the file suffix.

---

## 2. Options Reference

### `enabled`
- **Type**: `boolean`
- **Default**: `true` in development, `false` in production.
- **Description**: Master switch. If false, all network traffic passes through untouched.

### `aiEndpoints`
- **Type**: `(string | RegExp)[]`
- **Default**: Covers OpenAI, Anthropic, Gemini, DeepSeek, Google AI, Mistral, and many more. (See `DEFAULT_AI_ENDPOINTS`)
- **Description**: A list of hostnames to intercept. Use regex for local proxies like `localhost:11434` (Ollama).

### `cacheTtlMs`
- **Type**: `number`
- **Default**: `3600000` (1 Hour)
- **Description**: How long to keep a successful AI response in the local cache.

### `debounceMs`
- **Type**: `number`
- **Default**: `300`
- **Description**: The "Gathering Window". If two identical requests occur within this window, the second one will wait and share the result of the first.

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
