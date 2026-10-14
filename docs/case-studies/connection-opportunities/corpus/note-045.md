---
synthetic: true
---
# Service handover notebook

## Ordinary deployment

The thumbnail service reads pending jobs, creates temporary images and publishes complete files by rename. A release starts with one canary worker. Operators compare queue age, error rate and output checksums before replacing the remaining workers. Configuration is read at startup and the running revision appears in status output. Keeping the prior binary available makes rollback simpler, but rolling back code does not reverse already published effects.

## Queue ownership

A scheduler grants workers leases so abandoned jobs can eventually be claimed by another process. Heartbeats extend a lease while work progresses. Dashboards show the holder and expiration time. A stalled process can resume after a long pause, and its local belief about ownership may be old. Clock displays help investigation but do not by themselves establish authority to publish an output. Operators should keep the original job identifiers while examining such an incident.

## Planned maintenance

For routine shutdown, stop admitting jobs, let short work finish and preserve identifiers for unfinished work. Mark the maintenance window in the activity log. The queue may contain expired claims after a machine disappears; deleting the queue would lose the evidence needed to understand which jobs completed. A replacement scheduler must read durable state rather than trust an in-memory counter from the old process.

## Publication barrier

Every new claim receives a monotonically increasing fencing number. The storage layer remembers the largest number accepted for the resource and rejects writes carrying an older number. Lease expiry alone cannot stop a paused former owner from publishing after a successor has taken over; the resource must enforce this fence when committing the effect. Check the number and write the result atomically. A heartbeat timestamp checked only by the worker is insufficient.

The sequence must survive scheduler restarts. Reusing an old number would allow a delayed write to look current. Keep failed fence checks visible as stale-worker events rather than retrying them as transient storage errors. This rule is about authority of a writer, not deduplication of identical image bytes.

## Incident review

Collect the job identity, lease history, accepted fencing number and output revision. Compare the chronology without assuming that log arrival order equals event order. A process can buffer its logs during a pause. The repair is complete only when stale publications are prevented at the receiving resource and a rehearsal demonstrates rejection of an old claim.
