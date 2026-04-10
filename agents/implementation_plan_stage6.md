# Quota Guard 2.0: 稳定性与能力保障重构计划

本计划不仅追求架构的彻底重塑，更将“稳定性保障”和“既有能力对齐”作为核心 KPI。我们将通过严密的回归测试、领域隔离开发以及故障自愈设计，确保重构过程无损于既有功能。

## 1. 既有能力对齐矩阵 (Capability Mapping)

我们将确保以下核心能力在重构后完全保留：

| 现有核心能力 | 实现保障措施 |
| :--- | :--- |
| **非阻塞 AI 流式转发** | 通过 `StreamBroadcaster` 实现真正的多路输出，且对第一个订阅者保持零延迟。 |
| **深度对象序列化 (Deep Sort)** | 将 `deepSortKeys` 逻辑迁移并增强为专门的 `Normalizer` 模块。 |
| **非侵入式 Axios 适配** | 保留 `hookAxios` 逻辑并优化其对全局拦截器的检测，防止二次拦截。 |
| **全环境适配 (Fetch/XHR/Node)** | 利用 MSW Interceptors 进行标准化覆盖，并对比现有手写 Hack 逻辑，确保边界情况一致。 |
| **故障自愈 (Fail-safe)** | 引入全局异常边界捕获，任何重构引入的 bug 必须能触发透明降级，回退至原生网络库。 |

## 2. 稳定性保障策略

### 2.1 隔离开发与单元测试 (Isolation First)
*   **模块解耦**：将流分发、缓存决策、熔断状态分别实现在独立模块中。
*   **私有测试**：在集成之前，每个新模块必须达到 100% 的单元测试覆盖率，覆盖各种边界（如流突然中断、缓存写入失败）。

### 2.2 两阶段迁移 (Bridge Migration)
*   **阶段 A**：保留 `legacy_interceptor.ts` 作为对比基准，同时在并发测试中使用断言检查新旧 Pipeline 的 key 生成结果是否一致。
*   **阶段 B**：在确认新 Pipeline 稳定后，再进行全量替换。

### 2.3 健壮性设计 (Robustness by Design)
*   **流式背压 (Backpressure)**：在新广播器中处理背压，防止多个慢速订阅者导致内存爆炸。
*   **状态隔离**：熔断器状态由独立的 `BreakerStore` 管理，防止全局状态污染。

## 3. 详细实施步骤 (Execution Steps)

### 第一阶段：基础设施升级
1.  **[NEW] `src/core/pipeline.ts`**：实现标准的异步中间件逻辑。
2.  **[NEW] `src/streams/broadcaster.ts`**：跨平台流广播引擎，支持 `ReadableStream` 和 `Readable`。
3.  **[NEW] `src/providers/registry.ts`**：支持可插拔的提取规则。

### 第二阶段：核心拦截器替换
1.  **[REFACT] `src/core/interceptor.ts`**：
    *   移除所有 `Proxy` 和 `XMLHttpRequest` 手写劫持代码。
    *   引入 `BatchInterceptor`，按环境挂载 `Fetch`, `XHR` 和 `ClientRequest` 插件。
    *   将事件流导向 `Pipeline`。

### 第三阶段：能力验证与文档
1.  **[TEST] 回归测试**：运行所有 `tests/*.test.ts`。
2.  **[TEST] 负载测试**：模拟 100 个并发重复流式请求。
3.  **[DOC]**：更新 README，新增 `Stability Guide` 节。

---

## 4. 关键问题答疑

*   **Q: 如何保障 XHR 劫持不失效？**
    *   A: MSW 的 `XMLHttpRequestInterceptor` 会处理所有已知的浏览器规范。我们将同步运行 `tests/xhr.test.ts` 以验证所有自定义 Header、Body 和拦截逻辑依然奏效。
*   **Q: 如何保障 Node.js 环境的 `--require` 正常？**
    *   A: `register.ts` 的入口逻辑保持不变，确保 Node.js 的启动标志位加载顺序正确。
