# Providers and privacy

> **2.4.0 release candidate.** Check the [published releases](https://github.com/zinverno/veynrel/releases/latest) for the stable download. The [2.3.1 guide](https://github.com/zinverno/veynrel/tree/2.3.1/docs/wiki) covers the earlier interface.

| Feature | What leaves the device |
| --- | --- |
| Local Health, topology, Recall, existing-index views | No LLM request for these operations |
| Semantic index and text search | Note chunks or query to the selected embedding endpoint; Ollama may be local |
| Style, Recall generation, pair analysis and other generative tools | Disclosed selected inputs and instructions to the configured model endpoint |
| 2.3.1 only: diagram capability discovery | Model/endpoint metadata request to public OpenRouter; no note body or authorization in discovery |
| 2.3.1 only: diagram generation | Selected source and structured request after consent |
| 2.3.1 only: online Community | Public catalog and recipe GETs; no note bodies or provider keys |
| Optional Companion | Configured mirror to the selected server, under its own opt-in contract |

Local Health and Recall need no API key. An installed recipe is data, not a model execution. The first semantic index build is explicit, but configured incremental indexing can subsequently run on changes. Review your settings before using a sensitive vault.

Remote endpoints have their own logging, retention and charges. Local cancellation does not guarantee that a dispatched request was cancelled or unbilled. Model output is untrusted and can omit facts or invent details. Lexical checks and schema validation do not establish factual accuracy.

Settings and operation journals are local plaintext, not encrypted storage. Journals can hold before/after note text and may be copied by vault Sync/backup tools. Never include keys, entire private vaults, private model responses or raw account metadata in issue reports.

[Studio](Studio-recipes.md) · [Recovery](Safety-history-and-recovery.md) · [Security policy](../../SECURITY.md)
