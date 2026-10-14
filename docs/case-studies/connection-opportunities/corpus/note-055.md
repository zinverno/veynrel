---
synthetic: true
---
# Reconstructing state from an event log

An append-only sequence of accepted events can rebuild a projection after a crash. Save a projection checkpoint only after its state is durable, then replay events after that position. Event identity and ordering rules matter when delivery is repeated.

Replaying a projection is different from resubmitting an external action. The event records what was accepted, while a vanished remote response may leave that fact unknown. Keep side effects out of an unguarded replay loop. Snapshots speed recovery but should be verifiable against their log position.
