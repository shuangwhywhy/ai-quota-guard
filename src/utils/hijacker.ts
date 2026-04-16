import http from 'node:http';

/**
 * Utility to hijack Node.js http/https servers for HTML injection.
 * Historically used for browser-based interception without extensions.
 */
export class RuntimeHijacker {
    private static applied = false;

    public static __reset() {
        this.applied = false;
    }

    public static apply() {
        if (this.applied) return;
        this.applied = true;

        const originalCreateServer = http.createServer;

        // @ts-expect-error - Mocking node core
        http.createServer = function(arg1: unknown, arg2: unknown) {
            const requestListener = typeof arg1 === 'function' ? arg1 : arg2;
            const options = typeof arg1 === 'object' ? arg1 : {};

            const wrappedListener = (req: http.IncomingMessage, res: http.ServerResponse) => {
                RuntimeHijacker.hijackResponse(res);
                if (requestListener) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return (requestListener as any)(req, res);
                }
            };

            // @ts-expect-error - Patching native method
            return originalCreateServer.apply(http, [options, wrappedListener].filter(Boolean) as unknown[]);
        };
    }

    public static hijackResponse(res: http.ServerResponse) {
        const originalWrite = res.write;
        const originalEnd = res.end;
        const originalWriteHead = res.writeHead;
        const originalSetHeader = res.setHeader;

        let isHtml = false;
        let bodyBuffer = '';

        // @ts-expect-error - Patching native method
        res.setHeader = function(name: string, value: unknown) {
            if (name.toLowerCase() === 'content-type' && String(value).includes('text/html')) {
                isHtml = true;
            }
            return originalSetHeader.apply(this, [name, value]);
        };

        // @ts-expect-error - Patching native method
        res.writeHead = function(statusCode: number, ...args: unknown[]) {
            if (res.headersSent) return this;

            let headers: unknown = args[args.length - 1];
            if (typeof args[0] === 'string') {
                // writeHead(statusCode, reasonPhrase, headers)
                headers = args[1];
            }

            if (headers && typeof headers === 'object') {
                const h = headers as Record<string, unknown>;
                const contentType = h['content-type'] || h['Content-Type'];
                if (contentType && String(contentType).includes('text/html')) {
                    isHtml = true;
                }
            }
            return originalWriteHead.apply(this, [statusCode, ...args]);
        };

        // @ts-expect-error - Patching native method
        res.write = function(chunk: unknown, ...args: unknown[]) {
            if (isHtml && chunk) {
                bodyBuffer += chunk.toString();
                return true;
            }
            return originalWrite.apply(this, [chunk, ...args]);
        };

        // @ts-expect-error - Patching native method
        res.end = function(chunk: unknown, ...args: unknown[]) {
            if (isHtml) {
                if (chunk) bodyBuffer += chunk.toString();

                const injection = `
<!-- AI Quota Guard Bridge -->
<script src="/register.js"></script>
<script>
  window.__QUOTA_GUARD_ENABLED__ = true;
</script>
<!-- End Quota Guard Bridge -->
`;
                let finalHtml = bodyBuffer;
                if (finalHtml.includes('</head>')) {
                    finalHtml = finalHtml.replace('</head>', `${injection}</head>`);
                } else if (finalHtml.includes('<body>')) {
                    finalHtml = finalHtml.replace('<body>', `<body>${injection}`);
                } else {
                    finalHtml += injection;
                }

                if (res.getHeader('content-length')) {
                    res.setHeader('content-length', Buffer.byteLength(finalHtml));
                }

                return originalEnd.apply(this, [finalHtml, ...args]);
            }
            return originalEnd.apply(this, [chunk, ...args]);
        };
    }
}
