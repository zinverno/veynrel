---
synthetic: true
related:
  - "[[note-022]]"
---
# Configuration without pasted secrets

A local development process can read a credential from a restricted file or receive it through its environment. The value should stay out of command arguments, source files and logs. Diagnostics can report whether loading succeeded without printing the credential.

An environment variable is not magical encryption: child processes may inherit it and local inspection may reveal it. Limit the process lifetime and remove unnecessary inheritance. Synthetic test data reduces exposure if a remote integration must be exercised.
