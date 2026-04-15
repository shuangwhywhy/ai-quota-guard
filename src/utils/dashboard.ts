import { globalStats } from './stats-collector.js';
import type { ChalkInstance } from 'chalk';

/**
 * Quota Guard Terminal Dashboard: Real-time, event-driven.
 * Provides a summary of intercepted traffic, token usage, and top services.
 * 
 * NOTE: This module dynamically loads TUI libraries (cli-table3, log-update)
 * only when needed to avoid breaking browser environments.
 */

let dashboardInterval: NodeJS.Timeout | null = null;
let lastUpdate: ((...text: string[]) => void) & { clear(): void; done(): void; persist(...text: string[]): void } | null = null;
let originalStdoutWrite: (typeof process.stdout.write) | null = null;
let originalStderrWrite: (typeof process.stderr.write) | null = null;
let unsubscribe: (() => void) | null = null;

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

/**
 * Hijacks stdout/stderr to capture logs without printing them directly.
 */
const hijackStdio = () => {
    if (!isNode || originalStdoutWrite) return;

    originalStdoutWrite = process.stdout.write;
    originalStderrWrite = process.stderr.write;

    process.stdout.write = (chunk: Uint8Array | string, encoding?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void): boolean => {
        const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
        
        // Temporarily unsubscribe during the actual write to prevent recursion if we were to render here
        // But since addLog handles listeners, we just add it.
        globalStats.addLog(str);

        const cb = typeof encoding === 'function' ? encoding : callback;
        if (cb) cb();
        return true;
    };

    process.stderr.write = (chunk: Uint8Array | string, encoding?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void): boolean => {
        const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
        globalStats.addLog(str); 
        const cb = typeof encoding === 'function' ? encoding : callback;
        if (cb) cb();
        return true;
    };
};

/**
 * Restores original stdout/stderr.
 */
const restoreStdio = () => {
    if (originalStdoutWrite) {
        process.stdout.write = originalStdoutWrite;
        originalStdoutWrite = null;
    }
    if (originalStderrWrite) {
        process.stderr.write = originalStderrWrite;
        originalStderrWrite = null;
    }
};

// Global chalk instance for hijacking
let chalkInstance: ChalkInstance | null = null;

export const renderDashboard = async () => {
    if (!isNode) return;

    try {
        // Dynamic imports to prevent browser crashes
        const { default: Table } = await import('cli-table3') as unknown as { default: CliTable3 };
        const { default: logUpdate } = await import('log-update') as unknown as { default: typeof lastUpdate };
        
        if (!chalkInstance) {
            const mod = await import('chalk');
            chalkInstance = mod.default;
        }
        
        // Final guard for types
        if (!chalkInstance) return;
        const chalk = chalkInstance;

        const terminalWidth = process.stdout.columns || 80;
        const terminalHeight = process.stdout.rows || 30;
        const mainWidth = Math.min(terminalWidth - 4, 120);

        const { buffer, totals } = globalStats.getSnapshot();
        const rpm = globalStats.getFrequencyPerMinute();
        const logs = globalStats.getLogs();
        const debugUrls = globalStats.getDetectedUrls();

        // 0. Header with Right-Aligned Debug Info
        const timeStr = `Last Updated: ${new Date().toLocaleTimeString()}`;
        let urlStr = chalk.italic.gray('(No debug URLs found)');
        let urlPlain = '(No debug URLs found)';
        
        if (debugUrls.length > 0) {
            urlStr = `${chalk.bold.green('➜')} ${chalk.bold('App:')} ${debugUrls.map(u => chalk.cyan.underline(u)).join(', ')}`;
            urlPlain = `➜ App: ${debugUrls.join(', ')}`;
        }

        const paddingLength = Math.max(2, mainWidth - timeStr.length - urlPlain.length);
        const padding = ' '.repeat(paddingLength);

        const header = [
            chalk.bold.white(`\n  🛡️  Quota Guard Real-time Dashboard`),
            chalk.gray(`  ${timeStr}${padding}${urlStr}`),
            ''
        ];

        // 1. Stats Table
        const colWidth = Math.floor(mainWidth / 3);
        const statsTable = new Table({
            head: [
                chalk.blueBright('Metric'), 
                chalk.blueBright('Total'), 
                chalk.blueBright('Snapshot (1m)')
            ],
            colWidths: [colWidth, colWidth, colWidth],
            wordWrap: true
        });

        statsTable.push(
            ['Requests', totals.requests, buffer.length],
            ['Freq (RPM)', rpm > 30 ? chalk.bgYellow.black(` ${rpm} `) : rpm, rpm],
            ['Prompt Tokens', totals.receivedTokens, globalStats.calculateTokensInWindow('prompt')],
            ['Comp. Tokens', totals.responseTokens, globalStats.calculateTokensInWindow('completion')]
        );

        // 2. Token Funnel & Savings
        const savingsTable = new Table({
            head: [
                chalk.magentaBright('Usage Category'), 
                chalk.magentaBright('Tokens'), 
                chalk.magentaBright('Percentage')
            ],
            colWidths: [colWidth, colWidth, colWidth],
            wordWrap: true
        });

        const total = totals.receivedTokens + totals.responseTokens;
        const savedPct = total > 0 ? ((totals.savedTokens / (totals.savedTokens + totals.realSpentTokens)) * 100).toFixed(1) : '0.0';

        savingsTable.push(
            ['Total Processed', total, '100%'],
            [chalk.greenBright('Saved (Cache/Dedupe)'), totals.savedTokens, chalk.greenBright(`${savedPct}%`)],
            [chalk.cyanBright('Actual Network Spent'), totals.realSpentTokens, `${(100 - parseFloat(savedPct)).toFixed(1)}%`]
        );

        // 3. Recent Activity
        const recentColWidth = Math.floor(mainWidth / 4);
        const recentTable = new Table({
            head: [
                chalk.cyanBright('Time'),
                chalk.cyanBright('Type'),
                chalk.cyanBright('Host'),
                chalk.cyanBright('Tokens')
            ],
            colWidths: [recentColWidth, recentColWidth, recentColWidth, recentColWidth],
            wordWrap: true
        });

        buffer.slice(-3).reverse().forEach(e => { // Reduced to 3 to save space for logs
            const time = new Date(e.timestamp).toLocaleTimeString([], { hour12: false });
            const typeStr = e.type === 'LIVE' ? chalk.green('LIVE') : 
                          e.type === 'HIT' ? chalk.cyan('HIT') : 
                          e.type === 'SHARED' ? chalk.blue('SHARED') : chalk.red('BREAKER');
            recentTable.push([
                time,
                typeStr,
                e.hostname.substring(0, recentColWidth - 5),
                e.usage ? String(e.usage.totalTokens) : '-'
            ]);
        });

        // 4. Original Terminal Output (Dynamic Height)
        // Estimate lines used by tables and headers (~22 lines)
        const linesUsed = 26; 
        const logLinesAvailable = Math.max(5, terminalHeight - linesUsed);
        
        // We join parts of multi-line chunks to ensure we don't exceed window
        const allLogLines = logs.join('').split('\n');
        const displayLogs = allLogLines.slice(-logLinesAvailable).join('\n');

        const logsTable = new Table({
            colWidths: [mainWidth],
            wordWrap: false, // Keep raw formatting as much as possible
            style: { 'padding-left': 1, 'padding-right': 1 }
        });

        logsTable.push([displayLogs || chalk.italic.gray('(Waiting for output...)')]);

        // Final Output Assembly
        const output = [
            ...header,
            statsTable.toString(),
            `\n  ${chalk.bold.magenta('💰 Token Efficiency')}`,
            savingsTable.toString(),
            `\n  ${chalk.bold.cyan('📡 Recent AI Activity')}`,
            recentTable.toString(),
            `\n  ${chalk.bold.yellow('📜 Original Terminal Output')}`,
            logsTable.toString(),
            `\n  ${chalk.gray('  (Press Ctrl+C to stop dashboard)')}\n`
        ].join('\n');

        // To prevent logUpdate from using hijacked stdout, we need to temporarily restore or use originalWrite
        if (originalStdoutWrite) {
            const currentWrite = process.stdout.write;
            process.stdout.write = originalStdoutWrite;
            logUpdate(output);
            process.stdout.write = currentWrite;
        } else {
            logUpdate(output);
        }
        
        lastUpdate = logUpdate;
    } catch {
        // Fallback or ignore
    }
};


/**
 * Starts the dynamic dashboard refresh.
 */
export const startDashboard = async (intervalMs = 2000) => {
    if (!isNode || dashboardInterval) return;

    // 1. Take over console
    hijackStdio();

    // 2. Initial Draw
    await renderDashboard();

    // 3. Real-time Subscription (Requests & Logs)
    unsubscribe = globalStats.onRecord(() => {
        renderDashboard();
    });

    const unsubscribeLog = globalStats.onLog(() => {
        renderDashboard();
    });

    // 4. Heartbeat (for clock and RPM updates)
    dashboardInterval = setInterval(() => {
        renderDashboard();
    }, intervalMs);

    // Combine unsubscriptions
    const originalUnsubscribe = unsubscribe;
    unsubscribe = () => {
        originalUnsubscribe?.();
        unsubscribeLog();
    };
};

/**
 * Stops the dashboard refresh.
 */
export const stopDashboard = () => {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
    if (lastUpdate) {
        lastUpdate.done();
    }
    restoreStdio();
};
