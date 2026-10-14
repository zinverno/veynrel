---
synthetic: true
related:
  - "[[note-029]]"
---
# Finding an exact diagnostic token

For a literal identifier such as E_CONN_42, use an exact or lexical search that preserves underscores and digits. Inspect the tokenizer: some full-text indexes split punctuation, so a quoted phrase may still need a raw substring check. Exact identifiers are often rare and semantically opaque.

Vector similarity is useful for explanations expressed in different words, but can return a related error instead of the precise token. Offer lexical matching for this task and inspect the actual occurrence. Renaming the file to the token is unnecessary when its body is indexed correctly.
