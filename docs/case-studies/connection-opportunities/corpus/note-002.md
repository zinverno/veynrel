---
synthetic: true
---
# A simple retry timer

The small downloader waits one, two, four and eight seconds after consecutive connection failures. Deterministic intervals make its tests easy to reproduce. After four attempts it stops and shows the last transport status. A successful request resets the counter.

This schedule works for a single unattended client, but a fleet started at the same time can retry together. Raising the maximum delay reduces average load without necessarily removing those peaks. The download is read-only, and temporary files are renamed only after the checksum passes. Other operations need their own repeat-safety policy.
