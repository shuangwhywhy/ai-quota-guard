import { getConfig } from '../config';

export interface ProviderRule {
  name: string;
  hostnameMatch: string | RegExp;
  extractSemanticFields: (body: any) => any;
}

export const PROVIDER_RULES: ProviderRule[] = [
  {
    name: 'openai',
    hostnameMatch: /api\.openai\.com/,
    extractSemanticFields: (body) => ({
      model: body.model,
      messages: body.messages,
      prompt: body.prompt
    })
  },
  {
    name: 'anthropic',
    hostnameMatch: /api\.anthropic\.com/,
    extractSemanticFields: (body) => ({
      model: body.model,
      messages: body.messages,
      system: body.system
    })
  },
  {
    name: 'gemini',
    hostnameMatch: /generativelanguage\.googleapis\.com/,
    extractSemanticFields: (body) => ({
      model: body.model,
      contents: body.contents
    })
  },

  {
    name: 'deepseek',
    hostnameMatch: /api\.deepseek\.com/,
    extractSemanticFields: (body) => ({
      model: body.model,
      messages: body.messages
    })
  }
];

/**
 * Matches a URL to a provider and extracts only the relevant fields for hashing.
 */
export function extractSemanticFields(urlStr: string, body: any): any {
  if (typeof body !== 'object' || body === null) return body;

  const config = getConfig();
  const genericFields = config.intelligentFields || ['model', 'messages', 'prompt', 'system', 'contents', 'message'];
  
  const rule = PROVIDER_RULES.find(r => {
    if (r.hostnameMatch instanceof RegExp) {
      return r.hostnameMatch.test(urlStr);
    }
    const matchStr = String(r.hostnameMatch);
    // Be careful with URL parsing to avoid false positives in pathname
    try {
      const url = new URL(urlStr.startsWith('http') ? urlStr : 'https://' + urlStr);
      return url.hostname.includes(matchStr);
    } catch {
      return urlStr.includes(matchStr);
    }
  });

  const result: any = {};
  
  // 1. Extract provider-specific fields if matched
  if (rule) {
    const fields = rule.extractSemanticFields(body);
    Object.assign(result, fields);
  }

  // 2. Supplement with generic fields from config (user's custom fields)
  for (const f of genericFields) {
    if (body[f] !== undefined) {
      result[f] = body[f];
    }
  }

  // Remove undefined/null fields
  const filtered = Object.fromEntries(
    Object.entries(result).filter(([_, v]) => v !== undefined && v !== null)
  );
  
  // Final fallback: if nothing extracted, return full body to avoid collisions
  return Object.keys(filtered).length > 0 ? filtered : body;
}

