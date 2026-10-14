---
synthetic: true
---
# Joining two tables

A join combines rows using a stated relationship such as an order's customer identifier. Check whether the relationship is one-to-one or one-to-many before interpreting row counts. An unexpected multiplication of rows can look like duplicate data even when each table is internally correct.

Indexes can make lookup cheaper, but do not repair an incorrect join condition. Aggregate at the intended grain and test a small example by hand. A DISTINCT added at the end may hide the symptom while preserving the wrong calculation.
