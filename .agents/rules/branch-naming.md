---
trigger: model_decision
description: Definitive naming conventions and lifecycle rules for all repository branches
---

# Branch Naming Conventions & Lifecycle

To maintain project integrity and a clear history, all branches in this repository must strictly adhere to the following naming conventions and integration patterns.

## 1. Branch Categories

| Category | Regex Pattern | Protection | Description |
| :--- | :--- | :--- | :--- |
| **Main (Stable)** | `^main$` | **LOCKED** | Primary integration branch. Represents current "stable" state. |
| **Release (Snapshot)** | `^release$` | **LOCKED** | Production-stable branch. Holds verified release code. |
| **Stage (Integration)** | `^(pre|dev)$` | **LOCKED** | Shared branches for pre-release validation or staging. |
| **Feature** | `^feat/[a-z0-9-]+$` | Episodic | Implementation of new capabilities. |
| **Bug Fix** | `^fix/[a-z0-9-]+$` | Episodic | Resolution of technical issues or defects. |
| **Patch / Prep** | `^patch/[a-z0-9-]+$` | Episodic | Minor tweaks, documentation, or release preparation. |

## 2. Syntactic Rules

- **Casing**: Strictly `kebab-case` (lowercase letters and hyphens only).
- **Prefixes**: Every non-permanent branch MUST start with `feat/`, `fix/`, or `patch/`.
- **Prohibited Characters**: 
  - No uppercase letters.
  - No underscores (`_`).
  - No spaces.
  - No special characters (e.g., `!`, `@`, `#`, `$`, `%`) except for version dots in release patches (e.g., `patch/release-v2.2.4`).

## 3. Integration & Origin Rules

### Origin (The "Where From" Rule)
- **Default Origin**: Every new dynamic branch (`feat/`, `fix/`, `patch/`) **MUST originate from the latest `main` branch**.
- **Sync Requirement**: Before branching off, you MUST execute `git checkout main && git pull origin main`.

### Destination (The "Where To" Rule)
- **Integration Path**: All episodic branches must merge into `main` via a Pull Request.
- **Direct-to-Release Block**: Direct merges from `feat/` or `fix/` into `release` or `pre` are strictly prohibited. Code must land in `main` first.

### Release Workflow
1. Sync `main`.
2. Create `patch/release-v<version>` from `main`.
3. Perform version bumps and changelog updates on the patch branch.
4. PR the patch branch into `main`.
5. Once merged, create a tag and (if applicable) sync/PR `main` into `release`.

## 4. Enforcement
The agent will refuse to create, switch to, or commit to any branch that does not comply with these naming and origin rules.