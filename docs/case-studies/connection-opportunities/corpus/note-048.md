---
synthetic: true
---
# Importing a community catalogue

## Receiving the files

Contributors send spreadsheet exports with titles, quantities and prices. Preserve the received bytes and record their checksum before conversion. A staging directory separates unreviewed imports from the working catalogue. Do not infer a format solely from the filename extension. Ask which export settings produced the file, and keep that information with the batch so a later failure can be reproduced.

## Character decoding

Decode bytes using an explicitly confirmed character encoding. A wrong encoding can turn names into replacement characters before the parser sees a single field. Inspect representative non-ASCII names and reject undecodable bytes rather than silently dropping them. Line endings may differ between systems. A byte-order mark should be handled by the decoder or parser according to its documented behavior, not removed from arbitrary positions.

## Structural validation

Use a CSV parser that understands quoted delimiters and embedded newlines. Check that required column names occur once, and retain a row identifier for error reporting. A raw split on commas cannot preserve a quoted address containing commas. Empty fields, absent columns and literal zero values are different states. Batch summaries should count accepted and rejected records instead of calling a partial import complete.

## Localized numeric fields

For the supplier format in this catalogue, columns are separated by semicolons and decimals use a comma. Parse the semicolon-delimited, quoted fields first; then convert the price column with the declared decimal-comma locale. Thus the field 12,50 becomes the numeric value 12.50 without splitting it into two columns. Never replace every comma in the raw file: that would corrupt names, quoted addresses and other text. Reject a value whose separators do not match the declared format.

Keep original field text alongside conversion diagnostics until the batch is accepted. Thousands separators need a separate rule, and an empty price must not become zero by accident. A few sampled rows are not enough to prove every record uses the same format. Validate all rows before committing the new catalogue generation.

## Commit and recovery

Write the accepted batch into a transaction or a new generation and publish it only after validation finishes. A crash should leave the previous catalogue usable. The import log records source checksum, parser settings and rejected row identifiers. A corrected batch receives its own identity rather than overwriting the evidence of the failed attempt.
