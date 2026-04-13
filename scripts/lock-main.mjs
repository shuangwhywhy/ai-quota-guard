#!/usr/bin/env node
import { execSync } from 'child_process';

/**
 * Quota Guard: Main Branch Protection Script
 * Prevents direct commits or pushes to the 'main' branch.
 */

try {
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

  if (currentBranch === 'main') {
    // eslint-disable-next-line no-console
    console.error('\n\x1b[41m\x1b[37m[ERROR] Quota Guard Policy Violation\x1b[0m');
    // eslint-disable-next-line no-console
    console.error('\x1b[33mDirect commits to the "main" branch are prohibited.\x1b[0m');
    // eslint-disable-next-line no-console
    console.error('Please use the standard workflow: \x1b[32mdev/ -> pre/ -> main\x1b[0m via Pull Requests.\n');
    process.exit(1);
  }
} catch {
  // If not a git repo or other git error, just let it pass
  process.exit(0);
}
