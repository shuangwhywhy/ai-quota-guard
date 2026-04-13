/**
 * Token Parser: Extracts real usage or estimates tokens from AI requests/responses.
 */

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  isEstimated: boolean;
}

/**
 * Estimates tokens based on text length (heuristic: ~4 characters per token).
 */
export const estimateTokens = (text: string | unknown): number => {
  if (text === null || text === undefined) return 0;
  if (typeof text !== 'string') {
    try {
      text = JSON.stringify(text);
    } catch {
      return 0;
    }
  }
  const str = String(text);
  if (!str) return 0;
  // Standard heuristic: 1 token ~= 4 characters in English
  return Math.ceil(str.length / 4);
};

/**
 * Extracts real usage from OpenAI-compatible responses.
 */
export const parseTokenUsage = (body: unknown): TokenUsage | null => {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  // 1. Check for real 'usage' field (OpenAI, DeepSeek, Groq, etc.)
  if (b.usage && typeof b.usage === 'object') {
    const u = b.usage as Record<string, number>;
    if (u.prompt_tokens !== undefined || u.completion_tokens !== undefined) {
      return {
        promptTokens: u.prompt_tokens || 0,
        completionTokens: u.completion_tokens || 0,
        totalTokens: u.total_tokens || (u.prompt_tokens || 0) + (u.completion_tokens || 0),
        isEstimated: false
      };
    }
    // Anthropic uses input_tokens / output_tokens
    if (u.input_tokens !== undefined || u.output_tokens !== undefined) {
        return {
          promptTokens: u.input_tokens || 0,
          completionTokens: u.output_tokens || 0,
          totalTokens: (u.input_tokens || 0) + (u.output_tokens || 0),
          isEstimated: false
        };
      }
  }

  // 2. Gemini-specific usage
  if (b.usageMetadata && typeof b.usageMetadata === 'object') {
    const um = b.usageMetadata as Record<string, number>;
    return {
      promptTokens: um.promptTokenCount || 0,
      completionTokens: um.candidatesTokenCount || 0,
      totalTokens: um.totalTokenCount || 0,
      isEstimated: false
    };
  }

  return null;
};

/**
 * High-level utility to get token metrics for a request/response pair.
 */
export const computeUsage = (requestBody: string | null, responseBody: unknown): TokenUsage => {
  const realUsage = parseTokenUsage(responseBody);
  if (realUsage) return realUsage;

  // Fallback to estimation
  const promptTokens = estimateTokens(requestBody || '');
  const completionTokens = estimateTokens(responseBody);

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    isEstimated: true
  };
};
