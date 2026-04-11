# Design Specification: Multi-Environment Config System

This document outlines the standardized design for Quota Guard's configuration system, utilizing industry-standard libraries to ensure reliability, type safety, and strict environment isolation.

## 1. Core Architecture

We will adopt the **Unjs Stack** (`c12` for loading, `defu` for merging) to handle the complexity of file-system discovery and object manipulation. This follows the patterns established by major projects like Nuxt and Vite.

### 1.1 Support Formats & Extensions
The loader will support the following extensions in order of priority:
- `.ts` (TypeScript)
- `.js` | `.mjs` | `.cjs` (JavaScript)
- `.json` (JSON)
- `.yaml` | `.yml` (YAML)

## 2. Discovery & Search Hierarchy

### 2.1 Search Paths
To keep root directories clean, we support two primary locations:
1.  **Project Root**: `.quotaguardrc.[env].[ext]` or `.quotaguardrc.[ext]`
2.  **Dedicated Directory**: `.quota-guard/config.[env].[ext]` or `.quota-guard/config.[ext]`

### 2.2 Priority Order (Highest to Lowest)
1.  **Programmatic Overrides**: Passed directly to `injectQuotaGuard()`.
2.  **Environment Files**: Auto-detected via `NODE_ENV`. (e.g., `.quotaguardrc.production.ts`).
3.  **Local Base Files**: The main configuration file (e.g., `.quotaguardrc.ts`).
4.  **package.json**: Inside the `quotaGuard` field.
5.  **Built-in Defaults**: Hardcoded safe defaults.

## 3. Merging Semantics (Deep Dive)

We use `defu` for merging. The merging logic is strictly defined to prevent "configuration leakage" between environments:

| Type | Merging Strategy | Detail |
| :--- | :--- | :--- |
| **Primitives** | **Overwrite** | Higher priority values replace lower priority ones. |
| **Nested Objects** | **Deep Merge** | Recursively merges keys (e.g., `match` criteria in rules). |
| **Arrays** | **Replace** | **Crucial Strategy**: Arrays (like `aiEndpoints` or `rules`) are REPLACED, not merged, to ensure exact control in different environments. |

> [!TIP]
> **Explicit Merging**: In `.ts` or `.js` configs, users can manually `import` base configs and use `defu` or native spreads if they want to extend arrays rather than replace them.

## 4. Schema & Developer Experience

### 4.1 Schema Definition
The configuration schema remains compliant with the `QuotaGuardConfig` interface defined in `src/config.ts`. 

### 4.2 Type Safety (`defineConfig`)
We will export a `defineConfig` helper:
```typescript
import { defineConfig } from '@shuangwhywhy/quota-guard';

export default defineConfig({
  enabled: true,
  debounceMs: 500,
  rules: [ ... ]
});
```

## 5. Implementation Roadmap

### [NEW] [config.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/config.ts)
- Export `defineConfig` utility.

### [NEW] [loader.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/loader.ts)
- Implement `loadQuotaGuardConfig` using `c12`.
- Configure `defu` custom merger for **Array Replacement**.

### [MODIFY] [setup.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/setup.ts)
- Integrated `loadQuotaGuardConfig` into the boot lifecycle.
- Support `configPath` override.

### [MODIFY] [vite.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/vite.ts)
- Utilize the same loader logic to ensure dev/prod parity in the browser.

---

## 6. Open Questions

> [!IMPORTANT]
> **Array Replacement Default**: Does "Replacement for Arrays" meet your requirements for isolation? If you have 10 endpoints in base and 2 in production, only 2 will be guarded in prod unless you explicitly merge them in the `.ts` file. 

## 7. Verification Plan

### Automated Tests
- `tests/node/loader_discovery.test.ts`: Verify priority between root and `.quota-guard/` dir.
- `tests/node/loader_formats.test.ts`: Verify JSON vs YAML vs TS loading with same content.
- `tests/node/loader_merging.test.ts`: Verify deep merge of objects and replacement of arrays.

### Manual Verification
- Validate against a real world `.quotaguardrc.yaml` file.
