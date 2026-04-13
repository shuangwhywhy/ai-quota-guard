import chalk from 'chalk';

/**
 * Quota Guard Logger: High-fidelity, color-coded console output.
 */

export const ICONS = {
  HIT: '✅',
  LIVE: '🚀',
  SHARED: '🔗',
  BREAKER: '🛑',
  WARN: '⚠️',
  INFO: 'ℹ️'
};

export const COLORS = {
  HIT: chalk.greenBright,
  LIVE: chalk.cyanBright,
  SHARED: chalk.blueBright,
  BREAKER: chalk.redBright,
  WARN: chalk.yellowBright,
  INFO: chalk.white
};

export const logIntercept = (type: keyof typeof ICONS, key: string, url: string, details?: string) => {
  const icon = ICONS[type] || '';
  const color = COLORS[type] || chalk.white;
  const timestamp = new Date().toLocaleTimeString();

  const shortKey = key.slice(0, 7);
  const statusLabel = color.bold(type.padEnd(7));
  
  // Format: [HH:MM:SS] ✅ HIT     [abc1234] -> https://api.openai.com/...
  // eslint-disable-next-line no-console
  console.log(
    `${chalk.gray(`[${timestamp}]`)} ` +
    `${icon} ${statusLabel} ` +
    `${chalk.gray(`[${shortKey}]`)} ` +
    `${chalk.white('->')} ` +
    `${chalk.underline(url)}` +
    (details ? ` ${chalk.gray(`(${details})`)}` : '')
  );
};

export const logTable = (rows: string[][]) => {
  // Simple fallback logger for non-TTY environments
  // eslint-disable-next-line no-console
  rows.forEach(row => console.log(row.join(' | ')));
};
