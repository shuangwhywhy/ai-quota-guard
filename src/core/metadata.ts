import type { ResponseBroadcaster } from '../streams/broadcaster';

export interface RequestMetadata {
  key?: string;
  resolveBroadcaster?: (b: ResponseBroadcaster) => void;
}

/**
 * Type-safe storage for Quota Guard metadata associated with a Request.
 * Using a WeakMap prevents memory leaks and avoids monkey-patching native objects.
 */
export const requestMetadata = new WeakMap<Request, RequestMetadata>();

export const getMetadata = (request: Request): RequestMetadata => {
  return requestMetadata.get(request) || {};
};

export const setMetadata = (request: Request, meta: Partial<RequestMetadata>) => {
  const current = requestMetadata.get(request) || {};
  requestMetadata.set(request, { ...current, ...meta });
};
