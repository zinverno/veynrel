---
synthetic: true
---
# A name that remains missing after publication

Resolvers cache negative answers as well as successful lookups. After an NXDOMAIN response, a newly created DNS record may remain invisible to that resolver until the negative cache lifetime expires. Inspect the authority information and the relevant cache rather than repeatedly editing the correct new record.

Test the authoritative server separately from the recursive resolver. A low TTL set after the negative answer does not retroactively erase caches that already hold it. Browser and operating-system caches can add another layer. Document the observation time so later tests can be compared meaningfully.
