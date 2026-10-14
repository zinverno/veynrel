---
synthetic: true
---
# Numbered pages in a small report

LIMIT with OFFSET is convenient for a small, stable result set and for jumping to a numbered page. The database skips the offset rows before returning the requested portion. Large offsets can become expensive.

If new entries appear ahead of the current page, rows can repeat or be skipped between requests. A unique order avoids ambiguous ties but does not prevent the positions from shifting. For an immutable report generated from a fixed snapshot, numbered pages can still be a reasonable interface.
