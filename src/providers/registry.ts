import { getConfig } from '../config';

export interface ProviderRule {
  name: string;
  hostnameMatch: string | RegExp;
  extractSemanticFields: (body: Record<string, unknown>) => Record<string, unknown>;
}

export const PROVIDER_RULES: ProviderRule[] = [
  {
    name: 'openai',
    hostnameMatch: /api\.openai\.com/,
    extractSemanticFields: (body) => ({
      model: body.model as unknown as string,
      messages: body.messages as unknown as unknown[],
      prompt: body.prompt as unknown as string
    })
  },
  {
    name: 'anthropic',
    hostnameMatch: /api\.anthropic\.com/,
    extractSemanticFields: (body) => ({
      model: body.model as unknown as string,
      messages: body.messages as unknown as unknown[],
      system: body.system as unknown as string
    })
  },
  {
    name: 'gemini',
    hostnameMatch: /generativelanguage\.googleapis\.com/,
    extractSemanticFields: (body) => ({
      model: body.model as unknown as string,
      contents: body.contents as unknown as unknown[]
    })
  },

  {
    name: 'deepseek',
    hostnameMatch: /api\.deepseek\.com/,
    extractSemanticFields: (body) => ({
      model: body.model as unknown as string,
      messages: body.messages as unknown as unknown[]
    })
  },
  {
    name: 'mistral',
    hostnameMatch: /api\.mistral\.ai/,
    extractSemanticFields: (body) => ({
      model: body.model as unknown as string,
      messages: body.messages as unknown as unknown[],
      prompt: body.prompt as unknown as string
    })
  },
  {
    name: 'cohere',
    hostnameMatch: /api\.cohere\.ai/,
    extractSemanticFields: (body) => ({
      model: body.model as unknown as string,
      prompt: body.prompt as unknown as string,
      message: body.message as unknown as string
    })
  }
];

/**
 * Matches a URL to a provider and extracts only the relevant fields for hashing.
 */
export function extractSemanticFields(urlStr: string, body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;

  const bodyRecord = body as Record<string, unknown>;
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

  const result: Record<string, unknown> = {};
  
  // 1. Extract provider-specific fields if matched
  if (rule) {
    const fields = rule.extractSemanticFields(bodyRecord);
    Object.assign(result, fields);
  }

  // 2. Supplement with generic fields from config (user's custom fields)
  for (const f of genericFields) {
    if (bodyRecord[f] !== undefined) {
      result[f] = bodyRecord[f];
    }
  }

  // Remove undefined/null fields
  const filtered = Object.fromEntries(
    Object.entries(result).filter(([_, v]) => v !== undefined && v !== null)
  );
  
  // Final fallback: if nothing extracted, return full body to avoid collisions
  return Object.keys(filtered).length > 0 ? filtered : body;
}

