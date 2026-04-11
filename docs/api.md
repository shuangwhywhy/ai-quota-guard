# API Reference

This document covers the public functions and classes exported by `@shuangwhywhy/quota-guard`.

## Core Functions

### `injectQuotaGuard(config?: QuotaGuardConfig)`
The primary entry point for manual initialization.
- **`config`**: (Optional) A partial configuration object to override defaults.
- **Returns**: A cleanup function that removes all interceptors when called.

### `defineConfig(config: Partial<QuotaGuardConfig>)`
A helper function to provide type safety and autocompletion when writing your configuration file (e.g., `.quotaguardrc.ts`).

### `getConfig() / setConfig(config)`
Access or update the global configuration object at runtime.

### `removeGlobalGuards()`
Manually removes all network interceptors.

---

## Constants & Classes

### `globalCache`
An instance of the default `MemoryCache`. You can use this to manually inspect or clear the cache.

### `globalInFlightRegistry`
Tracks all active (in-flight) AI requests.

### `globalBreaker`
The global circuit breaker instance controlling the "Panic Button" logic.

### `CircuitBreaker`
The class used for implementing safety guards. You can instantiate your own for custom backoff logic.

---

## Interfaces

### `ICacheAdapter`
The interface required for custom cache implementations.

```typescript
interface ICacheAdapter {
  get(key: string): Promise<SerializedCacheEntry | null>;
  set(key: string, entry: SerializedCacheEntry, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
```

### `AuditEvent`
The data structure passed to the `auditHandler`. Useful for building custom dashboards or reporting.

| Field | Type | Description |
| :--- | :--- | :--- |
| `type` | `string` | Event type (e.g., `cache_hit`, `breaker_opened`). |
| `key` | `string` | The unique fingerprint hash of the request. |
| `url` | `string` | The target AI endpoint URL. |
| `timestamp`| `number` | Unix timestamp of the event. |
| `details` | `unknown`| Additional metadata (e.g., error objects, cache age). |
