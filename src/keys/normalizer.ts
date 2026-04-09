function simpleFnv1a(str: string): string {
  // Graceful fallback if native Crypto is somehow ripped out
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 ^= str.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return h1.toString(16);
}

function bufferToHex(buffer: ArrayBuffer): string {
  const hashArray = Array.from(new Uint8Array(buffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hash(str: string): Promise<string> {
  // Web Browser / Bun / Deno / Node 19+ WebCrypto
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    const enc = new TextEncoder();
    const data = enc.encode(str);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    return bufferToHex(hashBuffer);
  }

  // Node.js fallback (lazy import prevents Vite from eagerly bundling it if it's dead code in browser)
  if (typeof process !== 'undefined' && process.release?.name === 'node') {
    try {
      const m = 'crypto';
      const cryptoModule = await import(/* @vite-ignore */ m);
      if (cryptoModule && cryptoModule.createHash) {
        return cryptoModule.createHash('sha256').update(str).digest('hex');
      }
    } catch {
      // ignore
    }
  }

  return simpleFnv1a(str);
}

function isPlainObject(value: any): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof RegExp);
}

export function deepSortKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(deepSortKeys);
  }
  if (isPlainObject(obj)) {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = deepSortKeys(obj[key]);
        return acc;
      }, {} as any);
  }
  return obj;
}

export const generateStableKey = async (url: string | URL, method: string, body?: any): Promise<string | null> => {
  const urlStr = url.toString();

  // We only track POST/PUT for LLMs typically, but let's allow GET if it has query params
  let normalizedBody = '';

  if (body) {
    let parsedBody: any = null;
    if (typeof body === 'string') {
      try {
        parsedBody = JSON.parse(body);
      } catch (e) {
        parsedBody = body; // fallback
      }
    } else {
      parsedBody = body;
    }

    if (isPlainObject(parsedBody) || Array.isArray(parsedBody)) {
      normalizedBody = JSON.stringify(deepSortKeys(parsedBody));
    } else {
      normalizedBody = String(parsedBody);
    }
  }

  const rawString = `${method}:${urlStr}:${normalizedBody}`;
  return await sha256Hash(rawString);
};
