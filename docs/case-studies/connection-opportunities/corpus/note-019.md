---
synthetic: true
---
# Local snapshots that survive a mistaken deletion

Keep dated backup generations on a separate local disk. A snapshot tool can hard-link unchanged files while preserving older directory trees; deleting a source file must not remove its prior generations. Retention removes old snapshots only according to an explicit schedule.

A synchronized mirror usually propagates deletions, so it cannot by itself recover yesterday's accidentally removed file. Verify a restore into another folder and disconnect the backup disk after the job. Hard links save space only for unchanged content; editing files in a snapshot in place can damage shared data. Treat completed generations as immutable.
