---
synthetic: true
---
# Restarting a disposable build

The documentation preview is built in a temporary directory. If compilation fails, discard that directory and run the build from its clean inputs. No user edits live there, and outputs are cheap to regenerate. This avoids complicated partial-state recovery.

The strategy is unsuitable for an overnight conversion whose completed files are expensive to recreate. Keep the build input revision and compiler version in the log. A successful build replaces the published preview atomically, so visitors never see a half-written page.
