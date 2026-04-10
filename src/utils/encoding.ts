/**
 * Converts an ArrayBuffer to a Base64 string.
 * Supports both Node.js (via Buffer) and Browser (via btoa) environments.
 */
export function bufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  if (typeof btoa !== 'undefined') {
    return btoa(binary);
  }

  // Fallback for environments with neither Buffer nor btoa
  throw new Error('Quota Guard: No Base64 encoding utility found (Buffer or btoa).');
}

/**
 * Converts a Base64 string to an ArrayBuffer.
 */
export function base64ToBuffer(base64: string): ArrayBuffer {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  
  if (typeof atob === 'undefined') {
    throw new Error('Quota Guard: No Base64 decoding utility found (Buffer or atob).');
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
