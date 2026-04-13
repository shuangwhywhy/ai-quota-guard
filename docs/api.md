# API Reference

Quota Guard provides a streamlined public API focused on ease of injection and configuration.

## Core Functions

### `injectQuotaGuard(overrides?: Partial<QuotaGuardConfig>)`
The primary entry point. Initializes the global network interceptors and applies configuration.

- **overrides**: Optional configuration object to merge with defaults.
- **Returns**: `void`
- **Scope**: Can be called multiple times; subsequent calls will re-configure the active guard.

### `defineConfig(config: Partial<QuotaGuardConfig>)`
A type-safe helper for creating configuration objects with full autocompletion support.

- **config**: A partial configuration object.
- **Returns**: The same object (purely for type hinting).

### `setConfig(config: Partial<QuotaGuardConfig>)`
Directly updates the active configuration at runtime.

### `getConfig()`
Returns the currently active configuration object.

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
  get(key: string, ttlMs: number): Promise<SerializedCacheEntry | null>;
  set(key: string, entry: SerializedCacheEntry): Promise<void>;
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
