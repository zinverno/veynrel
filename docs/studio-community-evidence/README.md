# Community v1 native and public evidence

Runtime implementation: `ba5dbb8`; base `f9501a27209207da296fe69676fecaf19a0f1711`. Final documentation/harness/evidence commits do not change the runtime artifact hashes in [native-public.json](native-public.json).

**43 native checks passed, 21 screenshots, zero runtime exceptions**, on Linux Obsidian **1.13.7 / Electron 43.6.0**. Real isolated desktop, new synthetic vault/profile; no user vault or credentials. [Checks and gate results](checks.json), [raw report](native-public.json), [validation logs](validation-logs.txt), [checksums](SHA256SUMS).

The harness starts with an injected loopback HTTP catalog. It verifies passive opening, actual search/filter/card rendering, explicit install without Markdown/model IO, restart, duplicate prevention, numeric update, local-edit copy preservation, stale offline cache, delisting, corrupted cache/origins, and publication export. RU/EN × dark/light × 1200/390 px cover both the catalog and full recipe card. Native sidebars are collapsed for the 390 px matrix, as in the existing Studio harness; this is narrow desktop coverage, not physical mobile.

With `COMMUNITY_PUBLIC=1`, the same run restores the production HTTPS transport, loads the actual published Pages index, downloads and installs `meeting-structure@1.0.0`, restarts the process, and runs the installed recipe without another catalog connection. Explicit selected-note request consent → existing `callOpenRouter` transport → immutable Review → selected Apply → protected Undo restored all six original note hashes. **Two synthetic provider calls**, no paid/real-model request. This establishes execution/IO behavior, not semantic quality or factual accuracy.

The exported native package was also imported into a separate disposable catalog copy. All eight catalog tests passed and the extra synthetic submission generated a twelfth static page. That test submission was **not published**. Public browser evidence (13 checks, zero errors, only bodyless same-origin GETs) is in the [catalog repository](https://github.com/zinverno/veynrel-recipes/tree/feat/community-library-v1/docs/evidence).

Automated Veynrel gates: **4,933 tests / 183 files**, including **61 new Community tests**; typecheck/build/lint passed. Lint retains two visible, documented Fetch advisories: existing SSE streaming and Community's redirect/stream bounds. Proposal audit killed **5/5** mutations with restored baselines passing. An independent review found and prompted fixes for HTTP aborts, full Registry capacity, refresh races, unchecked static resources, checkpoint ancestry and immutable delisted metadata; regression tests cover them.

Public site: https://zinverno.github.io/veynrel-recipes/. Deployment [40441180389](https://github.com/zinverno/veynrel-recipes/actions/runs/40441180389) succeeded from catalog source `a29a537815d5ca2f0ba5b28e6066823eb8873204`. Initial default environment policy refusal and earlier harness failures remain recorded in `checks.json`; no failed attempt is reported as a pass.

Reproduce after building the plugin and preparing the catalog checkout:

```sh
COMMUNITY_PUBLIC=1 node scripts/studio-community-native.mjs /tmp/veynrel-community-native-UNIQUE /path/to/veynrel-recipes
```

Not verified: physical mobile, screen-reader speech, other OSes, third-party editors/themes, real-model quality, external Sync races or power-loss durability. Origin-storage uncertainty blocks further installation pending manual inspection; it never silently repairs provenance or replaces the existing Registry.
