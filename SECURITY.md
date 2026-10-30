# Security

Veynrel is a community-maintained project without a promised response-time SLA or a declared LTS security window. Use the latest published stable release; candidate branches are for review and testing.

## Reporting

As checked during 2.3.0 preparation, GitHub private vulnerability reporting is **not enabled**, and no dedicated security email is advertised. Do not assume a private report route exists.

For a suspected vulnerability, open a minimal issue titled **Security contact request** without exploit details, secrets, private note content or a proof of concept that puts users at risk. Ask the maintainer to establish a private channel before sharing sensitive details. If GitHub later shows an enabled **Report a vulnerability** control under Security, use that private route.

Do not publish API credentials, account metadata, whole vaults or plaintext operation journals. Reproduce with synthetic data where possible. For an exposed key, use the provider's own revocation controls; deleting an issue alone does not revoke it.

## Boundaries

Model output and Community recipe instructions are untrusted. A catalog SHA-256 is not an independent signature. Lexical preservation checks and schema validation do not prove factual accuracy. Local journals/settings can contain sensitive plaintext; backup/Sync software may copy them. Cancellation does not guarantee a remote request was unbilled. New notes/diagrams do not have universal rollback. See [privacy](docs/wiki/Providers-and-privacy.md) and [recovery](docs/wiki/Safety-history-and-recovery.md).
