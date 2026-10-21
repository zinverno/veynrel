#!/usr/bin/env bash
# Distribute beside main.js, manifest.json, styles.css, SHA256SUMS and SOURCE_COMMIT.
set -euo pipefail
umask 077

artifact_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
vault_arg=${1:-}
if [[ $# -ne 1 || "$vault_arg" != /* || ! -d "$vault_arg" ]]; then
  printf 'Usage: bash %q /absolute/path/to/test-vault\n' "${BASH_SOURCE[0]}" >&2
  exit 2
fi
vault_dir=$(realpath -e -- "$vault_arg")
case "$vault_dir" in
  /|*/New\ Life\ 2.0|*/Veynrel\ Lab\ 1000) printf 'Refusing the original vault. Choose an isolated test copy.\n' >&2; exit 2 ;;
esac
[[ -d "$vault_dir/.obsidian" && ! -L "$vault_dir/.obsidian" ]] || { printf 'Expected a test vault with a real .obsidian directory.\n' >&2; exit 2; }
[[ "$artifact_dir" != "$vault_dir" && "$artifact_dir" != "$vault_dir/"* ]] || { printf 'Build must be outside the vault.\n' >&2; exit 2; }
files=(main.js manifest.json styles.css)
[[ -f "$artifact_dir/SOURCE_COMMIT" && $(cat -- "$artifact_dir/SOURCE_COMMIT") =~ ^[0-9a-f]{40}$ ]] || { printf 'Missing source commit.\n' >&2; exit 2; }
[[ -f "$artifact_dir/SHA256SUMS" && $(wc -l < "$artifact_dir/SHA256SUMS") -eq 3 ]] || { printf 'Expected exactly three artifact hashes.\n' >&2; exit 2; }
for name in "${files[@]}"; do
  [[ -f "$artifact_dir/$name" && ! -L "$artifact_dir/$name" ]] || exit 2
  hash=$(sha256sum -- "$artifact_dir/$name"); hash=${hash%% *}
  grep -Fxq -- "$hash  $name" "$artifact_dir/SHA256SUMS" || { printf 'Hash mismatch: %s\n' "$name" >&2; exit 2; }
done
grep -Eq '"id"[[:space:]]*:[[:space:]]*"ai-knowledge-hub"' "$artifact_dir/manifest.json" || { printf 'Unexpected plugin ID.\n' >&2; exit 2; }
plugin_dir="$vault_dir/.obsidian/plugins/ai-knowledge-hub"
for path in "$vault_dir/.obsidian/plugins" "$plugin_dir"; do
  [[ ! -L "$path" && ( ! -e "$path" || -d "$path" ) ]] || { printf 'Refusing redirected plugin path.\n' >&2; exit 2; }
done
for name in "${files[@]}"; do
  [[ ! -L "$plugin_dir/$name" && ( ! -e "$plugin_dir/$name" || -f "$plugin_dir/$name" ) ]] || { printf 'Refusing non-regular target: %s\n' "$name" >&2; exit 2; }
done

backup_root="${XDG_STATE_HOME:-$HOME/.local/state}/veynrel-workbench-install"
backup_real=$(realpath -m -- "$backup_root")
[[ "$backup_real" != "$vault_dir" && "$backup_real" != "$vault_dir/"* ]] || { printf 'Backup directory must be outside the vault.\n' >&2; exit 2; }
mkdir -p -- "$backup_root"
backup_dir=$(mktemp -d "$backup_root/backup.XXXXXXXX")
printf '%s\n' "$vault_dir" > "$backup_dir/VAULT"
for name in "${files[@]}"; do
  if [[ -f "$plugin_dir/$name" ]]; then cp -p -- "$plugin_dir/$name" "$backup_dir/$name"; else printf '%s\n' "$name" >> "$backup_dir/ABSENT"; fi
done
printf 'Backup: %s\n' "$backup_dir"
printf 'Close this test vault in Obsidian before installing. Target: %s\n' "$vault_dir"
mkdir -p -- "$plugin_dir"
stage_dir=$(mktemp -d "$plugin_dir/.workbench-install.XXXXXXXX")
trap 'printf "Installation interrupted. Backup: %s; staging: %s\n" "$backup_dir" "$stage_dir" >&2' ERR
for name in "${files[@]}"; do cp -- "$artifact_dir/$name" "$stage_dir/$name"; chmod 644 -- "$stage_dir/$name"; done
for name in "${files[@]}"; do mv -f -- "$stage_dir/$name" "$plugin_dir/$name"; done
rmdir -- "$stage_dir"
(cd -- "$plugin_dir" && sha256sum --check --strict "$artifact_dir/SHA256SUMS")
printf 'Installed source %s\nSettings, semantic index and journals were preserved. Reopen the test vault and enable/reload Veynrel.\n' "$(cat -- "$artifact_dir/SOURCE_COMMIT")"
