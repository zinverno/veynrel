---
synthetic: true
---
# Durable progress in a batch converter

Our image converter processes a directory overnight. It writes each completed output to a temporary file, verifies it, then renames it and records the input checksum and completed position in a durable checkpoint. On restart it verifies recorded outputs and continues from the last committed boundary rather than beginning the directory again.

The checkpoint and output must agree. A counter advanced before a file is durable could skip work after a power loss. This design handles local, repeatable transformations. An external paid action whose response disappeared needs a receipt lookup; a local checkpoint alone cannot establish whether that action happened.
