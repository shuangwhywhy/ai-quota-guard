// A simple 32-bit hash function (djb2) suitable for browser & node where crypto might be cumbersome
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); /* hash * 33 + c */
  }
  return Math.abs(hash).toString(16);
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

export const generateStableKey = (url: string | URL, method: string, body?: any): string | null => {
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
  return djb2Hash(rawString);
};
