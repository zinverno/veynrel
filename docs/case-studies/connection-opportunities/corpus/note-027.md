---
synthetic: true
---
# Retryable and permanent failures

A read request may be repeated after a temporary connection failure within a fixed deadline. Authentication failures and invalid input generally require a change before another attempt. A response telling the client to slow down should influence scheduling.

Classifying a transport failure as temporary does not establish whether a remote write happened. The operation's repeat-safety contract must be checked separately. Collect attempt count and final status without logging credentials or full user payloads. Retry policy should remain bounded even during a long outage.
