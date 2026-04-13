import { globalStats } from './stats-collector.js';

/**
 * Quota Guard Terminal Dashboard: Real-time, 2s refresh.
 * Provides a summary of intercepted traffic, token usage, and top services.
 * 
 * NOTE: This module dynamically loads TUI libraries (cli-table3, log-update)
 * only when needed to avoid breaking browser environments.
 */

let dashboardInterval: NodeJS.Timeout | null = null;
let lastUpdate: { done?: () => void } | null = null;

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

export const renderDashboard = async () => {
    if (!isNode) return;

    try {
        // Dynamic imports to prevent browser crashes
        const { default: Table } = await import('cli-table3');
        const { default: logUpdate } = await import('log-update');
        const { default: chalk } = await import('chalk');

        const { buffer, totals } = globalStats.getSnapshot();
        const top10 = globalStats.getTopServices(10);
        const rpm = globalStats.getFrequencyPerMinute();

        // 1. Stats Table
        const statsTable = new Table({
            head: [
                chalk.blueBright('Metric'), 
                chalk.blueBright('Total'), 
                chalk.blueBright('Snapshot (1m)')
            ],
            colWidths: [20, 20, 20]
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
            ]
        });

        const total = totals.receivedTokens + totals.responseTokens;
        const savedPct = total > 0 ? ((totals.savedTokens / (totals.savedTokens + totals.realSpentTokens)) * 100).toFixed(1) : '0.0';

        savingsTable.push(
            ['Total Processed', total, '100%'],
            [chalk.greenBright('Saved (Cache/Dedupe)'), totals.savedTokens, chalk.greenBright(`${savedPct}%`)],
            [chalk.cyanBright('Actual Network Spent'), totals.realSpentTokens, `${(100 - parseFloat(savedPct)).toFixed(1)}%`]
        );

        // 3. Top Services
        const serviceTable = new Table({
            head: [
                chalk.yellowBright('Rank'), 
                chalk.yellowBright('Service Hostname'), 
                chalk.yellowBright('Freq (1m)')
            ]
        });

        top10.forEach((s, i) => {
            const row = [String(i + 1), s.hostname, String(s.frequency)];
            if (s.frequency > 10) {
                // Highlight high frequency services
                serviceTable.push(row.map(cell => chalk.bgYellow.black(cell)));
            } else {
                serviceTable.push(row);
            }
        });

        // Final Output Assembly
        const output = [
            chalk.bold.white(`\n  🛡️  Quota Guard Real-time Dashboard (Refresh: 2s)`),
            chalk.gray(`  Last Updated: ${new Date().toLocaleTimeString()}\n`),
            statsTable.toString(),
            `\n  ${chalk.bold.magenta('💰 Token Efficiency Funnel')}`,
            savingsTable.toString(),
            `\n  ${chalk.bold.yellow('📊 Top Services (Top 10)')}`,
            serviceTable.toString(),
            `\n  ${chalk.gray('  (Press Ctrl+C to stop dashboard display)')}\n`
        ].join('\n');

        logUpdate(output);
        lastUpdate = logUpdate;
    } catch {
        // If libraries fail to load (e.g. browser environment), just skip
    }
};


/**
 * Starts the dynamic dashboard refresh.
 */
export const startDashboard = (intervalMs = 2000) => {
    if (!isNode || dashboardInterval) return;
    renderDashboard();
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
    if (lastUpdate && lastUpdate.done) {
        lastUpdate.done();
    }
};
