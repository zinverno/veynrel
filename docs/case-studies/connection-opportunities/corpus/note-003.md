---
synthetic: true
---
# Admission control at the gateway

A token bucket allows short bursts while enforcing an average request rate. Incoming work spends a token; when the bucket is empty the gateway rejects or queues it within a bounded waiting period. Keep queue length, token refill rate and concurrent workers as separate controls.

Per-account quotas stop one tenant from consuming the entire service. They do not coordinate client timers after an outage. Capacity planning uses arrival rate and service time, while retry policy belongs to the caller. Dashboards should distinguish initial attempts from repeated traffic.
