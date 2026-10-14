---
synthetic: true
---
# Loss on one stream should not stall another

HTTP/2 multiplexes requests over a TCP connection, but a missing TCP segment holds later bytes until recovery. Independent application streams can therefore wait behind a loss affecting that connection. QUIC transports streams with independent ordered delivery, so missing data on one stream need not block delivery on unrelated streams.

This does not eliminate congestion control or delays in the affected stream. Shared network capacity still constrains all traffic. Compare traces under packet loss rather than treating the protocol name as a speed guarantee. Application dependencies can also force one request to wait for another.
