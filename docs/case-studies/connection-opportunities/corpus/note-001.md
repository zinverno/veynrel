---
synthetic: true
related:
  - "[[note-002]]"
---
# Recovery traffic after an outage

When many clients wake together, doubling every waiting interval still leaves them in step. Our load rehearsal had quiet gaps followed by sharp bursts. Give each caller an independently sampled pause between zero and its current ceiling. Increase that ceiling after a failure, with a cap and an overall deadline. Spread the arrivals instead of merely postponing the crowd.

The random generator should not receive the same seed in every container. Record attempt counts and elapsed time, not just the final status. A server hint may impose a minimum wait. This is traffic shaping during recovery; it does not make a side effect safe to execute twice.
