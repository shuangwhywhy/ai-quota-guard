import type { ResponseBroadcaster } from '../streams/broadcaster';

export interface InternalRequestMetadata {
  key?: string;
  resolveBroadcaster?: (b: ResponseBroadcaster) => void;
  requestBody?: string;
}

/**
 * Type-safe storage for Quota Guard metadata associated with a Request.
 * Using a WeakMap prevents memory leaks and avoids monkey-patching native objects.
 */
export const requestMetadata = new WeakMap<Request, InternalRequestMetadata>();

export const getMetadata = (request: Request): InternalRequestMetadata => {
  return requestMetadata.get(request) || {};
};

export const setMetadata = (request: Request, meta: Partial<InternalRequestMetadata>) => {
  const current = requestMetadata.get(request) || {};
  requestMetadata.set(request, { ...current, ...meta });
};
