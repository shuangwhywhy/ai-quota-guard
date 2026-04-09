# Quota Guard: 核心机制修复与细粒度策略优化 (修订版)

根据您的反馈，我们彻底重构了对于 Debounce（防抖）的方案设计。默认参数不再为0，并且将引入严谨的、真正符合防抖语义的标准实现。

## User Review Required

> [!IMPORTANT]
> **1. 关于标准 Debounce 的实现与默认配置 (重大更新)**
> - **默认值设定**：将 `debounceMs` 默认值设为 `300`（原为 0）。保证这是一个开箱即用且能有效拦截重复调用的核心级能力。
> - **真正的 "标准 Debounce" 机制**：抛弃原先简单粗暴抛出 `AbortError` 的做法。我们将引入类似 `p-debounce` 的**基于 Promise 共享的标准防抖逻辑**。
>   - **合并请求，不抛错误**：当在 300ms 内出现针对同一个 Key 的多次连续调用时（例如用户的密集连击），防抖定时器会被**不断重置**。当定时器最终结束触发唯一的网络请求时，前边所有在防抖期内挂起的调用**将全部共享并 resolve 最后这次请求的同一个 Promise**！这才是最标准的防抖体验，宿主应用不会收到任何恶意的警告或崩溃，且实现了完美的重合。
>   - **针对不同请求的隔离**：防抖分组键值默认切换为 **Intelligent Cache Key（即包含了 Model 和 Payload特征的哈希值，详见下方第二点）**。这样并发地发给大模型的完全不同的提问（例如多轮并发）不会因为命中同一个 URL 而被互相误杀取消；只有完完全全一样的短传重复调用才会被防抖合并。

> [!IMPORTANT]
> **2. Cache Key 的智能降级方案 (与防抖相辅相成)**
> 当前命中率低的原因是包含 `temperature`, `stream`, 时间戳等无关噪音。
> **引入 `cacheKeyStrategy`：默认采取 `'intelligent'`**。智能模式仅对 Body 内影响模型内容生成的核心字段（如 `model`, `messages`, `prompt`, `system`, `contents`, `message`）进行稳定哈希。其它各种噪音参数将被完全过滤屏蔽。

---

## Proposed Changes

### `src/config.ts`

- **[MODIFY] src/config.ts**
  - 修改 `getDefaultConfig` 中的 `debounceMs: 300`。
  - 在 `QuotaGuardConfig` 接口中，增加 `cacheKeyStrategy?: 'intelligent' | 'exact' | ((url: string, body: any) => any)` 字段。默认值为 `'intelligent'`。
  - 导出并增加细致注释。

---

### `src/keys/normalizer.ts`

- **[MODIFY] src/keys/normalizer.ts**
  - 引入核心字段白名单：`const INTELLIGENT_KEY_FIELDS = ['model', 'messages', 'prompt', 'system', 'contents', 'message'];`。
  - 强化处理：按照 `intelligent` 策略重组 Payload 对象，仅提取白名单字段后再 Hash，从根本上解决包含时间戳、temperature、随机 metadata 的误杀。

---

### `src/utils/debounce-promise.ts` (新建文件)

- **[NEW] src/utils/debounce-promise.ts**
  - 手写一个严格、标准、带类型推导的 `promiseDebouncer`。
  - 核心逻辑：维护一个全局 `Map<string, { timeout, resolvers[], rejecters[] }>`。如果在 delay 时间内同一 Key 再次进来，清除并重启 timeout，将新的 `resolve, reject` 压入当前桶的队列。Timeout 到期时执行一次动作，把所有该桶内的调用一次性 resolve 掉。

---

### `src/core/interceptor.ts`

- **[MODIFY] src/core/interceptor.ts**
  - **Fail-safe 机制补全:** 用一个整体的 `try...catch` 包裹拦截器的整个前置核心流水线。
  - 接入上述标准的 `promiseDebouncer` 取代原本粗糙的 `setTimeout` 加 `AbortError`。
  - 更新流合并（In-Flight），让标准的 debounce 成为 In-Flight Dedup 的第一道坚固防线。

---

### `src/vite.ts`

- **[MODIFY] src/vite.ts**
  - 修复 Vite 判断核心漏洞：
  - 更新正则为：`/[\/\\](main|index)\.[tj]sx?$/`
  - 严谨匹配 `main.tsx`, `index.jsx`, `main.js` 等真实的 React/Vue 前端入口规范，解决大面积无法注入的缺陷。

---

### `src/axios.ts`

- **[MODIFY] src/axios.ts**
  - 加入对 `config.adapter = 'fetch'` 的前置验证与版本兼容防弹封装，保证兼容性降级。

---

## Open Questions

无。按照您的严格诉求，`debounceMs` 已设为 `300` 默认触发。采用“挂起共享最终 Promise”而不是“简单中止抛错”是否完全贴合您心中对**标准拦截器 Debounce 的理解**？如果是的话，将立即执行本方案，并针对所有功能（特别是重构后的防抖）书写并跑通强大的单元测试集 (vitest test)。
