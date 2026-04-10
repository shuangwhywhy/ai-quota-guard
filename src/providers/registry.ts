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

  const rule = PROVIDER_RULES.find(r => {
    if (r.hostnameMatch instanceof RegExp) {
      return r.hostnameMatch.test(urlStr);
    }
    return urlStr.includes(r.hostnameMatch);
  });

  if (rule) {
    const fields = rule.extractSemanticFields(body);
    // Remove undefined fields
    const filtered = Object.fromEntries(Object.entries(fields).filter(([_, v]) => v !== undefined));
    
    // If no whitelisted fields were found even for a matched provider, 
    // fall back to the full body to ensure distinct inputs yield distinct keys.
    if (Object.keys(filtered).length === 0) return body;
    
    return filtered;
  }


  // Fallback to a generic list from config if no specific provider matched
  const config = getConfig();
  const genericFields = config.intelligentFields || ['model', 'messages', 'prompt', 'system', 'contents', 'message'];
  const result: any = {};
  for (const f of genericFields) {
    if (body[f] !== undefined) result[f] = body[f];
  }
  return Object.keys(result).length > 0 ? result : body;
}

