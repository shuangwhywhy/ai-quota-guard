---
trigger: model_decision
description: before you code
---

# Auto-Lint Governance

Agent MUST ensure all code is lint-compliant from the first draft while preserving logic.

1. **Scan & Contextualize**: Before coding, scan for `eslint`, `prettier`, `typescript` configs, and `package.json` scripts. Summarize and mount local standards as primary context.
2. **Mandatory Compliance**: Modifications MUST strictly follow detected rules. Automatically resolve introduced violations via `--fix` or manual adjustment without altering functional behavior.
3. **Triggered Synchronization**: Re-scan and update resident context immediately if:
   - Lint configurations are modified.
   - User provides style hints or verbal standards.
   - A new file modification task begins.
4. **Precedence**: Local project configurations ALWAYS supersede default AI style assumptions.

*Non-compliant output constitutes task failure.*
