---
synthetic: true
---
# Searching by meaning

Dense embeddings place passages with related meanings near each other even when their wording differs. Search embeds the question and ranks stored vectors by similarity. A document with several passages can be represented by several vectors, with the best match determining its document score.

This is useful for remembered ideas and cross-language discovery. Rare codes and exact numbers may not be preserved strongly enough for identifier lookup. A subsequent reranker can reorder retrieved passages, but cannot recover a document absent from its candidate pool.
