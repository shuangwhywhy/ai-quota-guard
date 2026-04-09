// A simple 32-bit hash function (djb2) suitable for browser & node where crypto might be cumbersome
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); /* hash * 33 + c */
  }
  return Math.abs(hash).toString(16);
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

    if (typeof parsedBody === 'object' && parsedBody !== null) {
      // Remove any inherently volatile fields that providers inject if we know them
      // For general purposes, we just serialize it deterministically (assume stable key order for simple bodies, or sort keys)
      normalizedBody = JSON.stringify(parsedBody, Object.keys(parsedBody).sort());
    } else {
      normalizedBody = String(parsedBody);
    }
  }

  const rawString = `${method}:${urlStr}:${normalizedBody}`;
  return djb2Hash(rawString);
};
