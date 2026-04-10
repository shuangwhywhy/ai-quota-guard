// Establish mock FIRST so Quota Guard can hook INTO it.
const originalNativeFetch = window.fetch;
window.fetch = function(...args) {
    const url = args[0].toString();
    if (url.includes('mock-ai')) {
        console.log('🚀 REAL NETWORK CALL INITIATED (this should only happen once)');
        return Promise.resolve(new Response(new ReadableStream({
            start(controller) {
                let count = 0;
                const interval = setInterval(() => {
                    controller.enqueue(new TextEncoder().encode(`Segment ${++count}\n`));
                    if (count >= 5) {
                        clearInterval(interval);
                        controller.close();
                    }
                }, 100); // Faster for test
            }
        }), {
            status: 200,
            headers: { 'Content-Type': 'text/plain' }
        }));
    }
    return originalNativeFetch.apply(this, args);
}

// @ts-ignore - Setting global config
window.__QUOTA_GUARD_CONFIG__ = {
    enabled: true,
    aiEndpoints: ['localhost', 'mock-ai'],
    cacheTtlMs: 10000,
    debounceMs: 0, // Disable debounce for immediate parallel test
};

import '../../src/register';

const logEl = document.getElementById('log')!;
const triggerBtn = document.getElementById('trigger')!;

function log(msg: string, isSuccess = false) {
    const div = document.createElement('div');
    if (isSuccess) div.className = 'success';
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
}

async function runTest() {
    log('Starting parallel requests...');
    const url = 'http://localhost:5173/mock-ai';
    const init = { method: 'POST', body: JSON.stringify({ prompt: 'test' }) };

    const tasks = [1, 2, 3].map(id => (async () => {
        log(`Subscriber ${id} starting...`);
        const res = await fetch(url, init);
        const reader = res.body!.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            log(`Subscriber ${id} received: ${new TextDecoder().decode(value).trim()}`, true);
        }
        log(`Subscriber ${id} FINISHED`);
    })());

    await Promise.all(tasks);
    log('--- ALL REQUESTS FINISHED ---');
}

triggerBtn.addEventListener('click', runTest);
