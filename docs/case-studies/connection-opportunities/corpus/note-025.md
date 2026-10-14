---
synthetic: true
---
# Holding a row while making a decision

SELECT FOR UPDATE obtains a row lock until the transaction ends. Other conflicting writers wait or fail according to their timeout. This is useful for a short critical section that must inspect and change shared state together.

Do not hold the transaction open while a person studies a form. Long-held locks increase contention and can participate in deadlocks. A lock timeout is not evidence that an update succeeded. Systems with long think time often need a different concurrency strategy.
