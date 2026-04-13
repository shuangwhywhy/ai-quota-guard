---
trigger: always_on
glob: "**/*"
description: "Git Operations and Branching Management Rules"
---

# Git Operations Rules

To ensure code stability and a clean history, the following Git operations rules must be strictly followed:

## 1. Main Branch Protection
- **No Direct Commits**: Never commit directly to the `main` branch.
- **No Local Merges**: Do not perform local merges into the `main` branch.
- **PR Required**: All changes must be merged into `main` via a GitHub Pull Request (PR).
- **Remote Synchronization**: The local `main` branch should only be updated by pulling from the remote repository (`git pull origin main`).

## 2. Branching Strategy
- **Feature Development**: Branch from `main` (or the latest stable development branch) to `feature/*`.
- **Online Issue Fixes (Hotfixes)**: If a fix for a production/online issue is required, you **must** branch directly from `main` to a `fix/*` branch (e.g., `fix/service-crash`).
- **Branch Naming**: Use descriptive names like `feature/dashboard-v2` or `fix/connection-leak`.

## 3. Deployment & Release
- Follow the project's release process (e.g., using `release-it`) only after PRs are merged and the environment is validated.
