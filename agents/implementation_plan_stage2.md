# Quota Guard Improvement Plan

This plan addresses the three potential limitations identified in the project analysis, ensuring they integrate seamlessly into the existing "zero intrusion" philosophy without breaking existing features.

## 1. AI Streaming Support (Non-blocking Interceptor)

**Problem**: `await response.arrayBuffer()` 强制阻塞了第一个请求，流式输出被破坏。且如果直接让原来的 `inFlightRegistry` 等待一个 `Response`，会导致多个组件共用一个 Stream 抛出 `Body is locked/disturbed` 异常。

**Solution & Code Proof**:
通过拆分核心逻辑：主请求立刻享有 `stream1`，后台静默使用 `stream2` 转换为 Buffer，且真正放入共享池 `inFlightRegistry` 的是一个 Promise 闭包，它只 resolve 最终的 ArrayBuffer 数据！
*向下兼容性证明*：这完美契合现有的 `buildResponse` 反序列化逻辑，原来等待 `inFlightPromise` 的重复请求将获得完整的缓存，完全不受主请求 Stream 被消费的影响。

新 `execLive` 核心代码预览：
```typescript
let resolver: (value: any) => void;
let rejecter: (reason?: any) => void;
// 共享池中只存放解析出 ArrayBuffer 结果的 Promise，绝不放 Response 实例
const cacheDataPromise = new Promise<any>((res, rej) => { resolver = res; rejecter = rej; });
globalInFlightRegistry.set(key, cacheDataPromise);

try {
  const response = await nativeFetch(input, init);
  const status = response.status;
  const headers: Record<string, string> = {};
  response.headers.forEach((val, k) => { headers[k] = val; });

  if (response.body) {
    const [stream1, stream2] = response.body.tee();
    
    // 后台静默处理流，填充 Cache
    (async () => {
      try {
        const buffer = await new Response(stream2).arrayBuffer();
        const cacheData = { responsePayload: buffer, headers, status, timestamp: Date.now() };
        if (response.ok) { globalBreaker.recordSuccess(key); globalCache.set(key, cacheData); }
        else { globalBreaker.recordFailure(key); }
        resolver(cacheData); // 唤醒所有等待中的 deduplicated requests
      } catch (err) {
        rejecter(err);
      } finally {
        globalInFlightRegistry.delete(key);
      }
    })();

    // 第一发起者立刻获得未消费的原声流！
    return new Response(stream1, { status, headers: response.headers });
  } else { ... } // 无 body 的降级逻辑
```

## 2. Robust Deep Object Serialization (Cache Key Stability)

**Problem**: 当前仅通过 `Object.keys(parsedBody).sort()` 进行排序，这只处理了第一层，对于 `{ messages: [{ role: 'user', content: 'hello' }] }`，内部数组中的对象属性顺序一旦错乱，Hash 会发生变动。且直接 sort 可能影响 Date、RegExp 等特殊对象类型。

**Solution & Code Proof**:
在 `normalizer.ts` 实现鲁棒的深层递归排序算法，排除内置对象，只对 plain object 进行排序。
```typescript
function isPlainObject(value: any): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 
         !(value instanceof Date) && !(value instanceof RegExp);
}

function deepSortKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(deepSortKeys); // 保证数组顺序绝对禁止被打乱
  if (isPlainObject(obj)) {
    return Object.keys(obj).sort().reduce((acc, key) => {
      acc[key] = deepSortKeys(obj[key]);
      return acc;
    }, {} as any);
  }
  return obj; // 基础类型或 Date, Null 保持原样
}
```

## 3. Legacy API Support (Axios/XHR) 解析与限制

**Problem & Pivot Solution**: 原生拦截 `XMLHttpRequest` 的风险和漏洞极大（涉及到精确模拟 `readyState`, `responseText`, `getAllResponseHeaders` 等多达数十个复杂属性，极其容易因为边缘情况导致原工程崩溃！）。
为了坚持“**绝对零侵入与零副作用**”的宗旨，全面代理 XHR 是反模式的。现代 `axios >= 1.7` 及主流前端框架都已经原生基于 `fetch` 或支持 `adapter: 'fetch'`。

**更安全的方案**：
既然 Quota Guard 是通过拦截底层 `globalThis.fetch` 生效的，我们将提供一个兼容包 `quota-guard/axios`，通过注入一个极其轻量级的 Axios Interceptor 拦截器，将对 AI 接口的请求无缝重定向到环境中的 `globalThis.fetch`，从而使其自动坠入我们的主逻辑网中。
这样：
1. 我们完全不需要制造千疮百孔的庞大 XHR 模拟层。
2. 开发者如果在用老项目，仅需一行代码 `import 'quota-guard/axios'` 即可将 Axios AI 调用自动走 fetch 通道，受全面保护。

## User Review Required

> [!WARNING] 
> XHR stream interception is notoriously complex. Our proposed XHR interceptor will primarily handle standard JSON request/responses. If a user uses XHR for *streaming* (which is rare as XHR streaming is cumbersome compared to Fetch), it will buffer. The Fetch streaming will be 100% flawless. Are you okay with this slight limitation on XHR?

## Verification Plan

### Automated Tests
- [x] Ensure all 4 existing tests in `interceptor.test.ts` pass without modification.
- [ ] Add explicit test for **Deep Sorting** in `normalizer.ts` to ensure `{"a": 1, "b": {"c": 2, "d": 3}}` equals `{"b": {"d": 3, "c": 2}, "a": 1}`.
- [ ] Add test for **Fetch Streaming**: simulate a `ReadableStream` response and confirm the interceptor returns it before the stream completes.
- [ ] Add explicit XHR test using native `XHR` mock to confirm Axios-like calls are cached and breaker-protected.
