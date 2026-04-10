# Implementation Plan - Hierarchical Guarding & Vocal Diagnostics

This plan establishes a production-grade strategy for resolving conflicts between Quota Guard and business logic. It prioritizes **Budget Safety** while providing **Transparent Diagnostics** and **Low-Intrusion Overrides**.

## 1. Principles of Governance

### 1.1 Hierarchical Defense (The "Two Lines" Policy)
We distinguish between guards that protect the system and those that optimize it:
- **Safety Guards (Circuit Breaker, In-flight Lock)**: **Mandatory Overwrites**. These protect against cascading failures and massive billing spikes. They are NOT bypassed by standard headers like `no-cache`.
- **Optimization Guards (Persistent Cache)**: **Respectful Defaults**. These can be bypassed by standard headers (`cache-control: no-cache`) or localized Rules to support developer debugging.

### 1.2 The Philosophy of "Acceptable Collisions"
In **Development/Debug** environments:
- Fingerprint collisions (different identity, same prompt) are **RECOMMENDED**. They maximize token savings.
- We discourage over-segmenting keys unless the logical isolation is strictly required by the business.

---

## 2. Conflict Detection & Vocal Diagnostics

We will implement a **Request Snapshot** mechanism to compare hits and detect hidden conflicts.

### 2.1 Conflict Types & English Warnings

#### TYPE A: [FINGERPRINT_COLLISION]
**Cause**: Key matches, but request metadata (Headers/Context) differs.
**Visibility**: Box-style console warning with specific parameter diffing.
**Example Output**:
```text
┌──────────────────────────────────────────────────────────────────┐
│ [Quota Guard] [FINGERPRINT_COLLISION]                            │
│ ──────────────────────────────────────────────────────────────── │
│ Target  : POST https://api.openai.com/v1/chat/completions        │
│ Conflict: Key [8f2b3ce] matches, but metadata differs.           │
│                                                                  │
│ Mismatched Parameters:                                           │
│  - [Header] 'X-User-ID': (Current: 'user_456') vs (Cached: 'user_123') │
│                                                                  │
│ Recommendation: Acceptable in DEV to save tokens. To isolate,    │
│ add 'X-User-ID' to 'keyHeaders' in your config.                 │
└──────────────────────────────────────────────────────────────────┘
```

#### TYPE B: [BYPASS_IGNORED]
**Cause**: Request signals a bypass (`no-cache`), but Guard prioritized safety.
**Visibility**: Prominent warning explaining the overwrite and how to release it.
**Example Output**:
```text
┌──────────────────────────────────────────────────────────────────┐
│ [Quota Guard] [BYPASS_IGNORED]                                   │
│ ──────────────────────────────────────────────────────────────── │
│ Target  : POST https://api.openai.com/v1/chat/completions        │
│ Trigger : Found 'cache-control: no-cache' in request headers.    │
│ Action  : IGNORED. Served from cache [8f2b3ce] (Safety Policy).  │
│                                                                  │
│ How to Bypass:                                                   │
│ 1. Use Header 'X-Quota-Guard-Bypass: true'                       │
│ 2. Or configure a 'rule' in .quotaguardrc for legacy passthrough.│
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Low-Intrusion Configuration (Control Plane)

### 3.1 Rule Engine
Instead of instrumenting every `fetch` call, we use centralized rules:
```typescript
interface QuotaGuardRule {
  match: {
    url?: string | RegExp;
    headers?: Record<string, string | RegExp>;
  };
  override: Partial<QuotaGuardConfig>;
}
```

### 3.2 Key Specificity
- **`keyHeaders`**: Configurable list of headers to include in the identity hash (e.g., `['X-Client-Id']`).

---

## 4. Documentation Requirements
The documentation must be "Strong and Absolutely Clear":
- **Quick Start**: Typical usage for React/Node.
- **Conflict Management**: A dedicated section explaining **Collision vs. Intent** and the "Safety First" rationale.
- **The "Philosophy" Section**: Explicitly stating why collisions are usually good in Dev.

## 5. Proposed Changes

### [MODIFY] [config.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/config.ts)
- Add `rules`, `keyHeaders`, and diagnostic toggle.

### [MODIFY] [registry/in-flight.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/registry/in-flight.ts) & [cache/memory.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/cache/memory.ts)
- Update storage schemas to include **Metadata Snapshots**.

### [MODIFY] [core/pipeline.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/core/pipeline.ts)
- Implement `ConflictDetector` and `RuleMatcher`.
- Add English diagnostic logger.

### [MODIFY] [keys/normalizer.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/keys/normalizer.ts)
- Update hash generation to include `keyHeaders`.
