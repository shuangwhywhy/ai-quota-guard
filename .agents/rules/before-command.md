---
trigger: always_on
glob: "**/*"
description: Pre-execution environment validation and path propagation
---

# Before Command Constraints

To ensure robust command resolution and maintain environment consistency across different execution contexts, every shell command must be preceded by an environment initialization step.

## Requirements

- **Debug Visibility**: Explicitly log the current `PATH` variable to provide a traceable record of the resolution environment.
- **Environment Propagation**: Re-export the `PATH` variable to ensure downstream processes and sub-shells correctly inherit the execution paths.
- **Atomic Execution**: Chain the initialization steps with the target command using logical AND operators to prevent execution in an unverified environment.

## Canonical Command Pattern

```bash
echo $PATH && export PATH && <your-command>
```
