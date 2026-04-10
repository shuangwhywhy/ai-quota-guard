import { getConfig } from '../config';
import { extractSemanticFields } from '../providers/registry';

export type JSONValue = string | number | boolean | null | { [key: string]: JSONValue } | JSONValue[];

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
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    const enc = new TextEncoder();
    const data = enc.encode(str);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    return bufferToHex(hashBuffer);
  }

  // Node.js fallback
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof RegExp);
}

/**
 * Recursively sorts the keys of an object to ensure stable JSON stringification.
 * Uses generics to maintain type information in tests and IDEs.
 */
export function deepSortKeys<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return (obj as unknown[]).map(item => deepSortKeys(item)) as unknown as T;
  }
  if (isPlainObject(obj)) {
    const result: Record<string, unknown> = {};
    const sortedKeys = Object.keys(obj).sort();
    for (const key of sortedKeys) {
      result[key] = deepSortKeys((obj as Record<string, unknown>)[key]);
    }
    return result as unknown as T;
  }
  return obj;
}

export const INTELLIGENT_KEY_FIELDS = ['model', 'messages', 'prompt', 'system', 'contents', 'message'];

export const generateStableKey = async (
  url: string | URL, 
  method: string, 
  body?: string | unknown, 
  strategy: 'intelligent' | 'exact' | ((u: string, m: string, b: unknown) => unknown) = 'intelligent',
  headers?: Record<string, string>
): Promise<string | null> => {
  const urlStr = url.toString();
  let normalizedBody = '';
  let extraContext = '';
  
  const config = getConfig();
  const keyHeaders = config.keyHeaders || [];
  if (headers && keyHeaders.length > 0) {
    const contextObj: Record<string, string> = {};
    for (const h of keyHeaders) {
      const val = headers[h] || headers[h.toLowerCase()];
      if (val) contextObj[h] = val;
    }
    if (Object.keys(contextObj).length > 0) {
      extraContext = JSON.stringify(deepSortKeys(contextObj));
    }
  }

  if (body) {
    let parsedBody: unknown = null;
    if (typeof body === 'string') {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        parsedBody = body;
      }
    } else {
      parsedBody = body;
    }

    if (typeof strategy === 'function') {
      parsedBody = strategy(urlStr, method, parsedBody);
    } else if (strategy === 'intelligent') {
      // Use the new provider-aware registry
      parsedBody = extractSemanticFields(urlStr, parsedBody);
    }

    if (isPlainObject(parsedBody) || Array.isArray(parsedBody)) {
      normalizedBody = JSON.stringify(deepSortKeys(parsedBody));
    } else {
      normalizedBody = String(parsedBody);
    }
  }

  const rawString = `${method}:${urlStr}:${normalizedBody}:${extraContext}`;
  return await sha256Hash(rawString);
};

