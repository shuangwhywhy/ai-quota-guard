import http from 'node:http';
import { getConfig } from '../config.js';

/**
 * Runtime HTML Hijacker: Patches Node.js http module to inject Quota Guard 
 * management scripts into served HTML pages automatically.
 */
export class RuntimeHijacker {
    private static applied = false;

    public static apply() {
        if (this.applied) return;
        this.applied = true;

        const originalCreateServer = http.createServer;

        // @ts-expect-error - Patching native method
        http.createServer = function(arg1: unknown, arg2: unknown) {
            const requestListener = typeof arg1 === 'function' ? arg1 : arg2;
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wrappedListener = (req: any, res: any) => {
                const originalWrite = res.write;
                const originalEnd = res.end;
                const originalSetHeader = res.setHeader;

                let isHtml = false;
                let bodyBuffer = '';

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                res.setHeader = function(name: string, value: any) {
                    if (name.toLowerCase() === 'content-type' && String(value).includes('text/html')) {
                        isHtml = true;
                    }
                    // @ts-expect-error - Patching native method
                    return originalSetHeader.apply(this, [name, value]);
                };

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                res.write = function(chunk: any, ...args: any[]) {
                    if (isHtml && chunk) {
                        bodyBuffer += chunk.toString();
                        return true;
                    }
                    // @ts-expect-error - Patching native method
                    return originalWrite.apply(this, [chunk, ...args]);
                };

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                res.end = function(chunk: any, ...args: any[]) {
                    if (isHtml) {
                        if (chunk) bodyBuffer += chunk.toString();
                        
                        const injection = `
<!-- Quota Guard Zero-Intrusion Bridge -->
<script>window.__QUOTA_GUARD_CONFIG__ = ${JSON.stringify(getConfig())};</script>
<script src="http://localhost:1989/register.js"></script>
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

                        // @ts-expect-error - Patching native method
                        return originalEnd.call(this, finalHtml);
                    }
                    // @ts-expect-error - Patching native method
                    return originalEnd.apply(this, [chunk, ...args]);
                };

                if (requestListener && typeof requestListener === 'function') {
                    return requestListener(req, res);
                }
            };

            if (typeof arg1 === 'function') {
                // @ts-expect-error - Patching native method
                return originalCreateServer.call(http, wrappedListener);
            }
            // @ts-expect-error - Patching native method
            return originalCreateServer.call(http, arg1, wrappedListener);
        };
    }

    /** @internal For testing only */
    public static __reset() {
        this.applied = false;
    }
}
