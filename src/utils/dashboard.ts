import { globalStats } from './stats-collector.js';

/**
 * Quota Guard Terminal Dashboard: Real-time, event-driven.
 * Provides a summary of intercepted traffic, token usage, and top services.
 * 
 * NOTE: This module dynamically loads TUI libraries (cli-table3, log-update)
 * only when needed to avoid breaking browser environments.
 */

let dashboardInterval: NodeJS.Timeout | null = null;
let lastUpdate: { (text: string): void; done(): void } | null = null;
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

    // @ts-expect-error - overriding native stdout.write
    process.stdout.write = (chunk: Uint8Array | string, encoding?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void) => {
        const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
        globalStats.addLog(str);
        const cb = typeof encoding === 'function' ? encoding : callback;
        if (cb) cb();
        return true;
    };

    // @ts-expect-error - overriding native stderr.write
    process.stderr.write = (chunk: Uint8Array | string, encoding?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void) => {
        const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
        globalStats.addLog(chalk.red(str));
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
let chalk: any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const renderDashboard = async () => {
    if (!isNode) return;

    try {
        // Dynamic imports to prevent browser crashes
        const { default: Table } = await import('cli-table3');
        const { default: logUpdate } = await import('log-update');
        if (!chalk) {
            const mod = await import('chalk');
            chalk = mod.default;
        }

        const terminalWidth = process.stdout.columns || 80;
        const mainWidth = Math.min(terminalWidth - 4, 120); // Cap at 120 for readability

        const { buffer, totals } = globalStats.getSnapshot();
        const rpm = globalStats.getFrequencyPerMinute();
        const logs = globalStats.getLogs();
        const debugUrls = globalStats.getDetectedUrls();

        // 0. Header & Debug URLs
        const header = [
            chalk.bold.white(`\n  🛡️  Quota Guard Real-time Dashboard`),
            chalk.gray(`  Last Updated: ${new Date().toLocaleTimeString()}`)
        ];

        if (debugUrls.length > 0) {
            header.push(`  ${chalk.bold.green('➜')}  ${chalk.bold('App URLs:')} ${debugUrls.map(u => chalk.cyan.underline(u)).join(' | ')}`);
        }
        header.push('');

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

        buffer.slice(-5).reverse().forEach(e => {
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

        // 4. Application Logs
        const logLinesAvailable = Math.max(10, (process.stdout.rows || 30) - 25);
        const logContent = logs.join('').split('\n').slice(-logLinesAvailable).join('\n');
        const separator = chalk.gray('─'.repeat(mainWidth));

        // Final Output Assembly
        const output = [
            ...header,
            statsTable.toString(),
            `\n  ${chalk.bold.magenta('💰 Token Efficiency')}`,
            savingsTable.toString(),
            `\n  ${chalk.bold.cyan('📡 Recent AI Activity')}`,
            recentTable.toString(),
            `\n  ${chalk.bold.yellow('📜 Application Logs')}`,
            separator,
            logContent || chalk.italic.gray('  (No logs captured yet)'),
            separator,
            `\n  ${chalk.gray('  (Press Ctrl+C to stop dashboard display)')}\n`
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
        // If libraries fail to load (e.g. browser environment), just skip
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

    // 3. Real-time Subscription
    unsubscribe = globalStats.onRecord(() => {
        renderDashboard();
    });

    // 4. Heartbeat (for clock and RPM updates)
    dashboardInterval = setInterval(() => {
        renderDashboard();
    }, intervalMs);
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
