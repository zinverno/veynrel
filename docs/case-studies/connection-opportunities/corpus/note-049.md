---
synthetic: true
---
# Electing a scheduler

Only one active scheduler should assign ordinary work at a time. A lease with periodic heartbeats can make a replacement possible after the original machine disappears. The lease duration trades faster recovery against more false suspicion during pauses.

An expired lease changes who may claim new work, but does not physically stop an old process that later wakes. This note describes election and monitoring, not a storage-side mechanism for rejecting its writes. Keep leadership changes visible and avoid using wall-clock log order as proof of which process acted first.
