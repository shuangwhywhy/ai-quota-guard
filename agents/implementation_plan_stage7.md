# Quota Guard Refinement & Alignment Plan

This plan aims to synchronize the project's documentation with its current implementation, harden the core interceptor logic, and upgrade the Vite plugin to a more robust, standard-compliant implementation.

## User Review Required

> [!IMPORTANT]
> **Circuit Breaker Response Change**: In the unified `hookFetch` mode, the circuit breaker will now return a custom status code (e.g., `599`) with a `X-Quota-Guard-Reason: breaker-open` header. This avoids confusion with standard `503` or `429` errors from the actual AI provider while still signaling a block. This should be transparent to most business logic which typically handles non-2xx as errors.

## Proposed Changes

---

### 1. Documentation Alignment

#### [MODIFY] [README.md](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/README.md)
- **Synchronize Audit Events**: Align the event table with the `AuditEvent` type in `config.ts` (e.g., adding `debounced`, `pass_through`, etc.).
- **Remove Promises/Placeholders**: Delete the empty "Native SDK Support" section.
- **Update Feature Descriptions**: Rebrand "Debounce" as "Request Aggregation/Merging" to better explain its synergy with deduplication.
- **Update Configuration Examples**: Ensure all code snippets use the latest `QuotaGuardConfig` fields.

---

### 2. Core Refinement (Types & Robustness)

#### [MODIFY] [src/core/interceptor.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/core/interceptor.ts)
- **Type Hardening**: Replace `any` with proper types from `@mswjs/interceptors`.
- **Environment Detection**: Improve XHR detection logic to avoid "traps" in JSDOM or hybrid environments.
- **Consistency**: 
    - In `hookFetch`, when `pipeline.processRequest` returns a breaker error, return a 503 response with descriptive headers.
    - Ensure the manual `createFetchInterceptor` remains backward compatible but shares the same internal response-generating logic.

#### [MODIFY] [src/providers/registry.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/providers/registry.ts)
- **Intelligent Fields Logic**: Ensure that even if a specific provider rule matches, it also considers `config.intelligentFields` if the primary extraction yields no results, or allow merging.

---

### 3. Standard Vite Plugin

#### [MODIFY] [src/vite.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/vite.ts)
- **Full Plugin Implementation**:
    - **Injection Logic**: Use `transformIndexHtml` to inject a `<script type="module" src="/@quota-guard/register"></script>` tag at the very top of `<head>`.
    - **Virtual Module**: Implement a Vite virtual module to serve the registration logic when the browser requests `/@quota-guard/register`.
    - **Reliability**: This removes the dependency on specific filenames like `main.ts` or `index.ts`.
    - **Dev Only**: Ensure the plugin explicitly disables itself and emits no code during production builds (`command === 'build'`).

## Open Questions

- **Is Status Code 599 Acceptable?**: I've selected `599` as a non-standard code to represent the local breaker open state. This avoids being mistaken for a remote provider error.

## Verification Plan

### Automated Tests
- `npm run test`: Ensure all existing tests pass with the new response types and Vite plugin logic.
- Add a specific test case for the new 503 Breaker response in `interceptor.test.ts`.

### Manual Verification
- Verify Vite plugin injection in a sample React/Vite project.
- Check that `npx tsc` passes with no `any` regressions in `interceptor.ts`.
