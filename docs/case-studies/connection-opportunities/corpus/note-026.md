---
synthetic: true
---
# The response vanished after submission

Before sending an external job, persist its stable operation identifier and a reserved state. If the connection closes after transmission, mark the outcome unknown. Ask the provider for the receipt using that identifier before considering another submission. A missing client response is not proof that the provider did no work or charged nothing.

Keep confirmed, failed-before-send and uncertain states distinct. A local process restart reloads the ledger and blocks uncertain operations. Where the provider has no lookup or idempotency guarantee, manual reconciliation may be necessary. A new identifier would hide the uncertainty rather than resolve it.
