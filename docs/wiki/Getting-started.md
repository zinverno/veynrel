# Getting started

> **2.3.0 release candidate; stable release is 2.2.1.**

## Local first

No model or API key is needed for local Health checks or authored-card Recall.

1. Enable Veynrel in your vault.
2. Open the command palette and run **Veynrel: Open Veynrel**, or click its ribbon icon.
3. On Home, choose a folder or the whole vault. Open **Check** and explicitly run local checks.
4. Inspect findings and their source evidence. A small or disconnected note may be intentional.
5. Add your own cards and open **Review** in the sidebar for [Recall](Recall.md).

![Choose an area in the native workspace](../../assets/showcase/2.3.0/health.png)

Expected result: local findings and a navigable source list. Synthetic example; no model result is pictured.

## Optional setup paths

- **Semantic discovery:** Veynrel settings → embedding connection → explicit first index build. Note chunks go to that endpoint. A model for writing is a different connection.
- **Markdown transformation:** Veynrel settings → language model → **Open Veynrel Studio** → Library. Select saved notes, inspect the request, then confirm generation.
- **Diagrams:** additionally enable Excalidraw 2.29.0 and use the verified public OpenRouter capability path. [Diagram setup](Excalidraw-diagrams.md)

A provider connection does not automatically prove a recipe's output is useful. [What is sent](Providers-and-privacy.md)
