# Providers and privacy

> **Veynrel 2.3.0 Stable.**

| Feature | What leaves the device |
| --- | --- |
| Local Health, topology, Recall, existing-index views | No LLM request for these operations |
| Semantic index and text search | Note chunks or query to the selected embedding endpoint; Ollama may be local |
| Markdown recipes, pair analysis, other generative tools | Disclosed selected inputs and instructions to the configured model endpoint |
| Diagram capability discovery | Model/endpoint metadata request to public OpenRouter; no note body or authorization in discovery |
| Diagram generation | Selected source and structured request after consent |
| Community | Public catalog and recipe GETs; no note bodies or provider keys |
| Optional Companion | Configured mirror to the selected server, under its own opt-in contract |

Local Health and Recall need no API key. An installed recipe is data, not a model execution. The first semantic index build is explicit, but configured incremental indexing can subsequently run on changes. Review your settings before using a sensitive vault.

Remote endpoints have their own logging, retention and charges. Local cancellation does not guarantee that a dispatched request was cancelled or unbilled. Model output is untrusted and can omit facts or invent details. Lexical checks and schema validation do not establish factual accuracy.

Settings and operation journals are local plaintext, not encrypted storage. Journals can hold before/after note text and may be copied by vault Sync/backup tools. Never include keys, entire private vaults, private model responses or raw account metadata in issue reports.

[Studio](Studio-recipes.md) · [Recovery](Safety-history-and-recovery.md) · [Security policy](../../SECURITY.md)
