# Maintaining the Wiki

`docs/wiki/` is the English source of truth. Edit it through the normal preparation PR. The public Wiki is a separate Git repository; source files alone do not populate it.

The exporter owns exactly the 14 pages listed in `scripts/export-wiki.py`. It preserves unknown pages, defaults to dry-run, rejects source drift and unsafe targets, and creates a backup of replaced pages plus a Git bundle when exporting to a clean Wiki clone. It never commits, pushes, force-pushes or deletes pages.

```sh
git clone https://github.com/zinverno/veynrel.wiki.git ../veynrel-wiki
python3 scripts/export-wiki.check.py
python3 scripts/export-wiki.py --source-ref <exact-source-SHA> --target /absolute/path/to/veynrel-wiki
python3 scripts/export-wiki.py --source-ref <exact-source-SHA> --target /absolute/path/to/veynrel-wiki --write --backup /absolute/path/to/new-backup
```

Review the changed owned pages, commit their explicit filenames, then perform a normal push. Never stage unknown pages automatically. Verify the public Home, sidebar and task/media links after pushing. The exporter pins media and repository links to the specified source commit.

If cloning reports Repository not found while the main repository is accessible and Wiki is enabled, initialization may be missing. The owner action is **Wiki → Create the first page → Home → Save**. Then clone again; do not invent a REST Wiki endpoint. An empty export directory can receive the same prepared pages locally until initialization is available.

During preparation every page says **2.3.0 release candidate; stable release is 2.2.1**. After authorized stable publication, update banners and durable release links in these sources, commit, export and verify again.
