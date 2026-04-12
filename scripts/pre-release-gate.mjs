import { execSync } from 'child_process';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const log = (msg) => console.log(msg);
const logStep = (name) => log(`\n${colors.cyan}${colors.bright}▶ Running: ${name}...${colors.reset}`);
const logSuccess = (name) => log(`${colors.green}✔ ${name} Passed${colors.reset}`);
const logFailure = (name, error) => {
  log(`\n${colors.red}${colors.bright}✖ ${name} Failed!${colors.reset}`);
  if (error) log(`${colors.red}${error.message || error}${colors.reset}`);
};

const runCommand = (name, command, failOnWarning = false) => {
  logStep(name);
  try {
    // We use stdio: 'inherit' for most but capture for lint to check warnings if needed
    // However, for simplicity and user requirement of "clear output", we'll inherit 
    // and rely on the --max-warnings 0 flag for eslint.
    execSync(command, { stdio: 'inherit' });
    logSuccess(name);
    return true;
  } catch (error) {
    logFailure(name);
    return false;
  }
};

async function main() {
  log(`\n${colors.bright}${colors.cyan}🛡️  AI Quota Guard: Pre-Release Gate${colors.reset}`);
  log(`${colors.cyan}──────────────────────────────────────────────────${colors.reset}`);

  const steps = [
    { name: 'Environment Setup (npm install)', command: 'npm install' },
    { name: 'Production Build (npm run build)', command: 'npm run build' },
    { name: 'Code Quality (npm run lint)', command: 'npm run lint' },
    { name: 'Stability & Coverage (npm run test:coverage)', command: 'npm run test:coverage' },
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
    log(`${colors.red}Please resolve the errors/warnings above before attempting to release again.${colors.reset}\n`);
    process.exit(1);
  } else {
    log(`\n${colors.green}${colors.bright}✅ RELEASE GATE PASSED${colors.reset}`);
    log(`${colors.green}System is in a stable, high-quality state. Proceeding with release...${colors.reset}\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
