---
synthetic: true
---
# Hard links and symbolic links

A hard link names the same underlying file data within a filesystem. A symbolic link stores a path that is resolved when followed. Moving a target can break a symbolic link, while editing data through one hard link affects the shared file.

Neither link creates an independent backup copy. Snapshot tools using hard links must treat completed generations as immutable. A symbolic link to a mount point does not prove the desired disk is present there. Choose links for navigation or storage layout only after understanding these identity rules.
