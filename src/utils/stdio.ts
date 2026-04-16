import { globalStats } from './stats-collector.js';

/**
 * Unified Stdio Manager to handle stdout/stderr hijacking.
 * Prevents recursive log capture during dashboard rendering.
 */
class StdioManager {
  private static instance: StdioManager;
  private originalStdoutWrite: (typeof process.stdout.write) | null = null;
  private originalStderrWrite: (typeof process.stderr.write) | null = null;
  private isCapturing = true;
  private isHijacked = false;

  public static getInstance(): StdioManager {
    this.instance = this.instance || new StdioManager();
    return this.instance;
  }

  /**
   * Hijacks stdout and stderr.
   * Ensures only one layer of wrapping exists even if called multiple times.
   */
  public hijack(): void {
    if (typeof process === 'undefined' || !process.stdout?.write || this.isHijacked) {
      return;
    }

    this.originalStdoutWrite = process.stdout.write;
    this.originalStderrWrite = process.stderr.write;

    // @ts-expect-error - overriding built-in write
    process.stdout.write = (
      chunk: string | Uint8Array,
      encoding?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void
    ): boolean => {
      let actualEncoding = encoding;
      let actualCallback = callback;
      if (typeof encoding === 'function') {
        actualCallback = encoding;
        actualEncoding = undefined;
      }

      const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      
      if (this.isCapturing) {
        globalStats.addLog(str);
      }

      return this.originalStdoutWrite!.call(process.stdout, chunk, actualEncoding as BufferEncoding, actualCallback);
    };

    // @ts-expect-error - overriding built-in write
    process.stderr.write = (
      chunk: string | Uint8Array,
      encoding?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void
    ): boolean => {
      let actualEncoding = encoding;
      let actualCallback = callback;
      if (typeof encoding === 'function') {
        actualCallback = encoding;
        actualEncoding = undefined;
      }

      const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);

      if (this.isCapturing) {
        globalStats.addLog(str);
      }

      return this.originalStderrWrite!.call(process.stderr, chunk, actualEncoding as BufferEncoding, actualCallback);
    };

    this.isHijacked = true;
  }

  /**
   * Restores original stdout and stderr.
   */
  public restore(): void {

    if (this.originalStdoutWrite) {
      process.stdout.write = this.originalStdoutWrite;
    }
    if (this.originalStderrWrite) {
      process.stderr.write = this.originalStderrWrite;
    }

    this.isHijacked = false;
    this.originalStdoutWrite = null;
    this.originalStderrWrite = null;
  }

  /**
   * Executes a function while suppressing log capture.
   * Use this during dashboard rendering.
   */
  public suppressCapture<T>(fn: () => T): T {
    const wasCapturing = this.isCapturing;
    this.isCapturing = false;
    try {
      return fn();
    } finally {
      this.isCapturing = wasCapturing;
    }
  }

  /**
   * Async version of suppressCapture.
   */
  public async suppressCaptureAsync<T>(fn: () => Promise<T>): Promise<T> {
    const wasCapturing = this.isCapturing;
    this.isCapturing = false;
    try {
      return await fn();
    } finally {
      this.isCapturing = wasCapturing;
    }
  }
}

export const stdioManager = StdioManager.getInstance();
