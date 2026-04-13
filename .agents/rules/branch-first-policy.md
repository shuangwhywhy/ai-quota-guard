---
trigger: always_on
glob: "**/*"
description: Branch-first enforcement policy to prevent direct commits to protected branches and ensure contextual dev branches
---

# Branching Policy & Enforcement

To maintain repository integrity, all file modifications must strictly adhere to the project's branching strategy. Failure to follow this policy may result in lost work or broken release pipelines.

## Critical Rules

1. **No Direct Modification or Commit of Protected Branches**: 
   - Modifying files or executing **`git commit`** directly on `main` or `release` is strictly prohibited.
   - If identified on these branches, you MUST invoke the `branching-workflow.md` workflow to transition to a feature, fix, or patch branch.

2. **Branch Naming & Category Conventions**:
   - All branches MUST strictly adhere to the patterns and lifecycles defined in [branch-naming.md](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/.agents/rules/branch-naming.md).
   - Dynamic branches MUST match the regex: `^(feat|fix|patch)\/[a-z0-9-]+$`.
   - **`fix/*`**: Technical bug resolution.
   - **`feat/*`**: New capabilities.
   - **`patch/*`**: Minor adjustments and release preparation.

3. **Contextual Continuity**:
   - If you are on an active development branch (`fix/`, `feat/`, `patch/`), verify the new task's affinity.
   - If unrelated, you MUST obtain user confirmation before switching or continuing.

4. **Branch Origin Rule**:
   - Every new development branch (`fix/`, `feat/`, `patch/`) must originate from the latest `main` branch by default.
   - You MUST ensure the local `main` is synchronized with `origin/main` before branching off.

5. **Work Preservation**:
   - Any uncommitted changes MUST be preserved when transitioning branches.
   - For `main` -> `new branch` transitions, `git checkout -b` is sufficient.
   - For transitions between development branches, use `git stash` to protect existing work before switching.

6. **"Branch-First" Requirement**:
   - The terminal must be confirmed as being on the correct branch **BEFORE** any file write operations (`replace_file_content`, `write_to_file`, etc.) or non-idempotent commands are executed.

## Enforcement
Any attempt to bypass these rules will trigger a realignment request via the `branching-workflow.md` workflow.
