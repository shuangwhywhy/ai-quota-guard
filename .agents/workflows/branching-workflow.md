---
trigger: always_on
glob: "**/*"
description: Procedural guide for branch verification and transition before file modifications
---

# Git Branching & Transition Workflow

This workflow ensures that every file modification is performed on a correctly context-aligned branch, preventing accidental commits to protected branches and maintaining a clean development history.

## Trigger
This workflow must be invoked whenever:
1. The agent intends to modify project files (via `replace_file_content`, `write_to_file`, `multi_replace_file_content`, or state-modifying `run_command`).
2. The agent discovers **uncommitted changes** on a protected branch (`main`, `release`), even without a direct user request.
3. The agent intends to execute a **`git commit`** operation.

## Steps

### 1. Branch Discovery
Before applying any changes, identify the current active branch.
// turbo
```bash
echo $PATH && export PATH && git branch --show-current
```

### 2. Task Categorization
Analyze the user's request to determine the appropriate branch prefix according to the conventions in [branch-naming.md](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/.agents/rules/branch-naming.md):
- **`fix/`**: Resolving bugs, errors, or unexpected behavior.
- **`feat/`**: Implementing new capabilities or major enhancements.
- **`patch/`**: Minor tweaks, styling fixes, typo corrections, release preparation, or direct documentation updates.

### 3. Transition Logic

#### Case A: Protected Branch (`main`, `release`)
If the current branch is `main` or `release`, you **MUST NOT** proceed with modifications.
1. **Sync with Base**: Ensure the local `main` is up-to-date.
// turbo
```bash
echo $PATH && export PATH && git checkout main && git pull origin main
```
2. **Propose & Checkout**: Propose a new name and branch off from `main`. Uncommitted changes on `main` are automatically carried over by `checkout -b`.
// turbo
```bash
echo $PATH && export PATH && git checkout -b <proposed-branch-name>
```

#### Case B: Development Branch (`fix/*`, `feat/*`, `patch/*`)
- **Default Origin**: By default, new branches should originate from the latest `main`.
- **Relationship Analysis**:
    - **If the task is related**: If the new request continues or is highly relevant to the current branch context, carry out the modification on the current branch.
    - **If the task is unrelated**: 
        1. **Preserve Current Work**: If uncommitted changes exist, `git stash` them to prevent pollution.
        2. **Inform & Ask**: 
            - Inform the user: *"This request is unrelated to <current-branch>. I will base the new branch on 'main' as per policy."*
            - Ask for confirmation: *"Would you like me to switch to a new branch originating from main?"*
        3. **Process After Confirmation**:
            - If confirmed: Execute **Case A** steps (Sync `main` -> `checkout -b`).
            - If denied: Proceed on the current branch (pop stash if applicable).

### 4. Verification & Lock
Confirm the terminal is positioned on the correct branch before executing any file write operations.
// turbo
```bash
echo $PATH && export PATH && git branch --show-current
```
### 5. Pre-Commit Guard
Before executing `git commit`:
1. **Target Verification**: Confirm you are NOT on `main` or `release`.
2. **Mandatory Redirection**: If on a protected branch, you MUST abort the commit and immediately jump to **Step 3 (Transition Logic)** to move existing changes to a compliant branch.
