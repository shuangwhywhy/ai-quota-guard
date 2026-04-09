# Quota Guard: 功能遗漏修复与架构闭环方案

针对查找到的三大核心遗漏（Node 原生 http 模块漏拦、内存被动溢出、ESM 启动兼容），我们规划了针对性的底层修补方案。

## User Review Required

> [!IMPORTANT]
> **关于 Node 原生 `http/https` 模块的底层拦截决策**
> 实现 100% 毫无冲突地劫持原生的 `ClientRequest` 并抹平它与 `Fetch API` 的差异（比如事件驱动模型到 Promise 模型的转换）需要处理巨量的流状态缓冲、加密绕过以及生命周期映射。如果强行手写几十行的 hack 代码，极易与 APM 工具（如 Datadog/NewRelic）或其他基于 Node streams 的框架冲突。
> **提案**：采纳您说的“可以用成熟工具库”思路。我计划引入业界公认最高标准、专为零冲突拦截设计的底层无头库 **`@mswjs/interceptors`** 作为唯一的运行时依赖。它可以将所有底层的 `http/https/XMLHttpRequest` 网络动作统一泛化为标准的 `Fetch Request` 规范供本项目的 `core/interceptor` 享用，这能做到真正的工业级无漏洞防冲突。您是否允许引入此依赖？（增加少量的 bundle size 换取绝对稳定）。

> [!TIP]
> **关于 MemoryCache 的零负担回收策略**
> 我会重构内存机制：给每个缓存条目附加一个 `ttlMs` 存活标识。每次调用 `set()` 或 `get()` 时给内置全局计数器 `+1`。当计数器积累到 `100`（或配置的特定数量）次时，执行一次无阻塞的哈希表全面扫描 `sweep` 清理过期对象。这能彻底终结原本的懒惰求值型内存泄漏，且彻底放弃了 `setInterval` 守护进程，非常绿色轻量。

---

## Proposed Changes

### 引入标准协议拦截引擎
- **[MODIFY] package.json**
  - 在 `dependencies` 中添加 `@mswjs/interceptors`。

### `src/core/interceptor.ts` (全面统一网络底层)

- **[MODIFY] src/core/interceptor.ts**
  - 弃用当前粗糙的 `globalThis.fetch = new Proxy(...)`。
  - 引入 `BatchInterceptor`，加载 `ClientRequestInterceptor`（负责 `http/s`）和 `FetchInterceptor`。
  - 给拦截器挂载统一的监听动作：捕获到 AI 路由请求后，依然走之前的 `Quota Guard Pipeline`（防抖 -> 熔断 -> 缓存 -> 队列 -> 调用真实网络）。从而将 fetch 和传统的 Node `http` 调用实现 100% 无缝的大整合覆盖。

### `src/cache/memory.ts` (基于事件触发的扫雪 GC)

- **[MODIFY] src/cache/memory.ts**
  - 扩展 `SerializedCacheEntry` 接口，补入 `ttlMs: number`。
  - 加入计数器逻辑：`this.opCount++; if (this.opCount > 100) this.sweepIfNecessary()`。
  - `sweepIfNecessary` 将扫描整个 Map 并将超时的 Key 执行释放，从源头上掐断业务堆内存泄漏。

### 文档更新 (填平生态代沟)

- **[MODIFY] README.md**
  - 补充 Node.js **ESM 模块**场景下的标准挂载命令声明：`NODE_ENV=development node --import quota-guard/register app.js`。
  - 增加关于通过 `http` 传统模块调用的支持说明，补全整个愿景闭环。

---

## Open Questions

核心问题：**完全授权引入 `@mswjs/interceptors` 作为底层收口核心吗？** 这样我们的 Guard 无论是被旧时代 axios 甚至 `request` 库触发，还是最新的基于 `undici/fetch` 框架调用，都将无处遁形地进入这套防抖排重网。如果同意，我将立即进入架构更新与落地。
