import { createDefu } from 'defu';

/**
 * Specialized merger for Quota Guard configurations.
 * Arrays (like aiEndpoints or rules) are overwritten rather than concatenated
 * to give users full control over the final list.
 */
export const quotaGuardMerger = createDefu((obj: Record<string, unknown>, key, value) => {
  if (Array.isArray(obj[key]) || Array.isArray(value)) {
    obj[key] = value;
    return true;
  }
});
