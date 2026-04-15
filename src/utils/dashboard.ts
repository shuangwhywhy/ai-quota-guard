import { globalStats } from './stats-collector.js';
import type { ChalkInstance } from 'chalk';
import * as readline from 'readline';
import { stdioManager } from './stdio.js';

/**
 * Quota Guard Terminal Dashboard: Real-time, event-driven.
 * Provides a summary of intercepted traffic, token usage, and top services.
 */

let dashboardInterval: NodeJS.Timeout | null = null;
let lastUpdate: ((...text: string[]) => void) & { clear(): void; done(): void; persist(...text: string[]): void } | null = null;
let unsubscribe: (() => void) | null = null;
let unsubscribeLog: (() => void) | null = null;

// Interaction State
let scrollOffset = 0;
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

// Global chalk instance and cached imports
let chalkInstance: ChalkInstance | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let TableCtor: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let logUpdateHandler: any = null;

/**
 * Pre-cache dynamic imports to prevent flickering during render.
 */
const ensureImports = async () => {
    if (!TableCtor) {
        const { default: Table } = await import('cli-table3') as unknown as { default: CliTable3 };
        TableCtor = Table;
    }
    if (!logUpdateHandler) {
        const { default: logUpdate } = await import('log-update') as unknown as { default: typeof lastUpdate };
        logUpdateHandler = logUpdate;
    }
    if (!chalkInstance) {
        const mod = await import('chalk');
        chalkInstance = mod.default;
    }
};

/**
 * Handles keyboard interaction for scrolling.
 */
const setupInteraction = () => {
    if (!isNode || !process.stdin.isTTY) return;

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
    }

    process.stdin.on('keypress', (str, key) => {
        if (key.ctrl && key.name === 'c') {
            stopDashboard();
            process.exit(0);
        }

        if (key.name === 'up') {
            scrollOffset = Math.max(0, scrollOffset - 1);
            renderDashboard();
        } else if (key.name === 'down') {
            scrollOffset++;
            renderDashboard();
        } else if (key.name === 'pageup') {
            scrollOffset = Math.max(0, scrollOffset - 10);
            renderDashboard();
        } else if (key.name === 'pagedown') {
            scrollOffset += 10;
            renderDashboard();
        } else if (key.name === 'home') {
            scrollOffset = 0;
            renderDashboard();
        } else if (key.name === 'end') {
            scrollOffset = 10000; // Will be capped in render
            renderDashboard();
        } else if (key.name === 'q') {
            stopDashboard();
        }
    });
};

/**
 * Cleanup interaction listeners.
 */
const cleanupInteraction = () => {
    if (!isNode) return;
    if (process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
    }
    process.stdin.removeAllListeners('keypress');
};

export const renderDashboard = async () => {
    if (!isNode) return;

    // Use suppressCapture to prevent infinite recursion
    return stdioManager.suppressCaptureAsync(async () => {
        try {
            await ensureImports();
            const Table = TableCtor;
            const logUpdate = logUpdateHandler;
            const chalk = chalkInstance!;
            
            const terminalWidth = process.stdout.columns || 80;
            const terminalHeight = process.stdout.rows || 30;
            const mainWidth = Math.min(terminalWidth - 4, 120);

            const { buffer, totals } = globalStats.getSnapshot();
            const rpm = globalStats.getFrequencyPerMinute();
            const logs = globalStats.getLogs();
            const debugUrls = globalStats.getDetectedUrls();

            // 0. Header (Height: 3)
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

            // 1. Stats Table (Height: ~6)
            const colWidth = Math.floor(mainWidth / 3);
            const statsTable = new Table({
                head: [chalk.blueBright('Metric'), chalk.blueBright('Total'), chalk.blueBright('Snapshot (1m)')],
                colWidths: [colWidth, colWidth, colWidth],
                wordWrap: true
            });
            statsTable.push(
                ['Requests', totals.requests, buffer.length],
                ['Freq (RPM)', rpm > 30 ? chalk.bgYellow.black(` ${rpm} `) : rpm, rpm],
                ['Prompt Tokens', totals.receivedTokens, globalStats.calculateTokensInWindow('prompt')],
                ['Comp. Tokens', totals.responseTokens, globalStats.calculateTokensInWindow('completion')]
            );

            // 2. Token Funnel (Height: ~5)
            const savingsTable = new Table({
                head: [chalk.magentaBright('Usage Category'), chalk.magentaBright('Tokens'), chalk.magentaBright('Percentage')],
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

            // 3. Recent Activity (Height: ~5)
            const recentColWidth = Math.floor(mainWidth / 4);
            const recentTable = new Table({
                head: [chalk.cyanBright('Time'), chalk.cyanBright('Type'), chalk.cyanBright('Host'), chalk.cyanBright('Tokens')],
                colWidths: [recentColWidth, recentColWidth, recentColWidth, recentColWidth],
                wordWrap: true
            });
            buffer.slice(-3).reverse().forEach(e => {
                const time = new Date(e.timestamp).toLocaleTimeString([], { hour12: false });
                const typeStr = e.type === 'LIVE' ? chalk.green('LIVE') : 
                              e.type === 'HIT' ? chalk.cyan('HIT') : 
                              e.type === 'SHARED' ? chalk.blue('SHARED') : chalk.red('BREAKER');
                recentTable.push([time, typeStr, e.hostname.substring(0, recentColWidth - 5), e.usage ? String(e.usage.totalTokens) : '-']);
            });

            // Ensure at least one row in recent table to maintain structure
            if (recentTable.length === 0) {
                recentTable.push([chalk.gray('-'), chalk.gray('-'), chalk.gray('-'), chalk.gray('-')]);
            }

            // 4. Log Output (Dynamic Height)
            // Header(3) + Stats(6) + TokenTitle(1) + Token(5) + ActivityTitle(1) + Activity(5) + LogTitle(1) + Footer(2) = 24
            const linesUsed = 24;
            const logLinesAvailable = Math.max(3, terminalHeight - linesUsed);
            
            const allLogLines = logs.join('').split('\n').filter(l => l.trim().length > 0);
            
            // Adjust scrollOffset
            const maxScroll = Math.max(0, allLogLines.length - logLinesAvailable);
            scrollOffset = Math.min(scrollOffset, maxScroll);
            
            const startLine = Math.max(0, allLogLines.length - logLinesAvailable - scrollOffset);
            const displayLogs = allLogLines.slice(startLine, startLine + logLinesAvailable).join('\n');

            const logsTable = new Table({
                colWidths: [mainWidth],
                wordWrap: false,
                style: { 'padding-left': 1, 'padding-right': 1 }
            });
            logsTable.push([displayLogs || chalk.italic.gray('(Waiting for output...)')]);

            // Footer
            const scrollInfo = maxScroll > 0 ? chalk.yellow(` [Scroll: ${scrollOffset}/${maxScroll}] Arrows/PageUp/Down to scroll`) : '';
            const footer = `\n  ${chalk.gray(`(Press 'q' or Ctrl+C to stop dashboard)${scrollInfo}`)}\n`;

            const output = [
                ...header,
                statsTable.toString(),
                `\n  ${chalk.bold.magenta('💰 Token Efficiency')}`,
                savingsTable.toString(),
                `\n  ${chalk.bold.cyan('📡 Recent AI Activity')}`,
                recentTable.toString(),
                `\n  ${chalk.bold.yellow('📜 Original Terminal Output')}`,
                logsTable.toString(),
                footer
            ].join('\n');

            // Atomic update: Clear scrollback and update output in one go if possible
            // or just use 3J for scrollback and logUpdate for the rest.
            process.stdout.write('\x1b[3J'); 
            logUpdate(output);
            lastUpdate = logUpdate;
        } catch {
            // console.error('Dashboard Error:', err);
        }
    });
};

export const startDashboard = async (intervalMs = 2000) => {
    if (!isNode || dashboardInterval) return;

    // Standard hijacking is already done by setup.ts, 
    // but we ensure it's active and we have interaction
    stdioManager.hijack();
    setupInteraction();

    await renderDashboard();

    unsubscribe = globalStats.onRecord(() => {
        renderDashboard();
    });

    unsubscribeLog = globalStats.onLog(() => {
        renderDashboard();
    });

    dashboardInterval = setInterval(() => {
        renderDashboard();
    }, intervalMs);
};

export const stopDashboard = () => {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
    if (unsubscribeLog) {
        unsubscribeLog();
        unsubscribeLog = null;
    }
    if (lastUpdate) {
        lastUpdate.done();
    }
    cleanupInteraction();
    // We don't necessarily want to restore stdio here if the app is still running,
    // as Quota Guard might still want to capture logs for the next dashboard start or other reasons.
    // But for a clean stop, we can.
    stdioManager.restore();
};
