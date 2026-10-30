# Community library

> **2.3.0 release candidate; stable release is 2.2.1.**

Open **Veynrel Studio → Community**. The local library works independently of online catalog access.

1. Explicitly load or refresh the public catalog.
2. Inspect a card's author, version, compatibility and full recipe instructions.
3. Install a local copy. Installation does not read notes or call a model.
4. Open it in Library, select saved notes and follow the separate preparation/consent/Review flow.
5. Check for updates explicitly. Review differences and local edits; there are no silent updates.

![Community recipe details](../../assets/showcase/2.3.0/community.png)

Real native UI and public recipe metadata. Any subsequent generation shown in the media uses synthetic notes and controlled responses, not a model-quality benchmark.

Catalog downloads contain metadata and recipe text, not your note content or inference credentials. A cached catalog can be stale and is labelled accordingly. SHA-256 verifies agreement with the downloaded catalog; it is not an independent signature or an endorsement of the recipe's instructions.

To contribute, use the separate [recipe repository](https://github.com/zinverno/veynrel-recipes). Preserve immutable published recipe versions; submit new versions for updates. [Studio workflow](Studio-recipes.md) · [Data flows](Providers-and-privacy.md)
