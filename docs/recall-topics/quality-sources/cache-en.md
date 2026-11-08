# A bounded cache policy

This application caches successful profile lookups for at most five minutes. Failed lookups are not cached. A user can invalidate a cached profile immediately after editing it.

The cache key includes both tenant ID and profile ID. A profile ID alone is insufficient because two tenants may use the same profile ID.

A cache miss triggers a lookup in the authoritative store. An expired entry behaves as a miss. An available unexpired entry can reduce repeated store reads, but this policy does not promise that every read is current for the whole five-minute interval.
