import { spawnSync } from 'child_process';

/** 
 * AI Quota Guard: Pre-Release Gatekeeper
 * 
 * This script ensures that the codebase is in a stable, high-quality state
 * before allowing a release-it process to proceed.
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

/* eslint-disable no-console */
const log = (msg) => console.log(msg);
const logStep = (name) => log(`\n${colors.cyan}${colors.bright}▶ Running: ${name}...${colors.reset}`);
const logSuccess = (name) => log(`${colors.green}✔ ${name} Passed${colors.reset}`);
const logFailure = (name, errorMessage) => {
  log(`\n${colors.red}${colors.bright}✖ ${name} Failed!${colors.reset}`);
  if (errorMessage) log(`${colors.red}${errorMessage}${colors.reset}`);
};

const runCommand = (name, command) => {
  logStep(name);
  
  const [cmd, ...args] = command.split(' ');
  const result = spawnSync(cmd, args, { 
    stdio: ['inherit', 'inherit', 'pipe'],
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' }
  });

  if (result.status !== 0) {
    const stderr = result.stderr.toString();
    // Filter out known harmless npm warnings from the error output to reduce noise
    const importantErrors = stderr
      .split('\n')
      .filter(line => !line.includes('Unknown user config "home"') && !line.includes('Unknown env config "home"'))
      .join('\n')
      .trim();

    logFailure(name, importantErrors);
    return false;
  }

  logSuccess(name);
  return true;
};

async function main() {
  log(`\n${colors.bright}${colors.cyan}🛡️  AI Quota Guard: Pre-Release Gate${colors.reset}`);
  log(`${colors.cyan}──────────────────────────────────────────────────${colors.reset}`);

  const steps = [
    { name: 'Production Build', command: 'npm run build' },
    { name: 'Code Quality (Lint)', command: 'npm run lint' },
    { name: 'Stability & Coverage', command: 'npm run test:coverage' },
  ];

  const results = [];
  let blocked = false;

  for (const step of steps) {
    if (blocked) {
      results.push({ name: step.name, status: 'SKIPPED' });
      continue;
    }

    const success = runCommand(step.name, step.command);
    results.push({ name: step.name, status: success ? 'PASSED' : 'FAILED' });
    
    if (!success) {
      blocked = true;
    }
  }

  log(`\n${colors.cyan}──────────────────────────────────────────────────${colors.reset}`);
  log(`${colors.bright}Release Gate Summary:${colors.reset}`);
  
  for (const res of results) {
    const statusColor = res.status === 'PASSED' ? colors.green : (res.status === 'FAILED' ? colors.red : colors.yellow);
    log(`  ${res.name.padEnd(40)} [ ${statusColor}${res.status}${colors.reset} ]`);
  }

  if (blocked) {
    log(`\n${colors.red}${colors.bright}🛑 RELEASE BLOCKED${colors.reset}`);
    log(`${colors.red}One or more quality checks failed. Please resolve the issues above.${colors.reset}\n`);
    process.exit(1);
  } else {
    log(`\n${colors.green}${colors.bright}✅ RELEASE GATE PASSED${colors.reset}`);
    log(`${colors.green}Proceeding with release...${colors.reset}\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
