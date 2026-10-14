---
synthetic: true
---
# Home archive operations

## Layout

The small server stores photographs on a removable data disk and keeps the operating system on another device. A nightly scanner builds a local catalogue with image dimensions and checksums. Family members browse the catalogue without opening every original file. The catalogue can be rebuilt, whereas the originals need independent backups. Record which disk holds each generation rather than relying on its current desktop label.

## Routine scan

The scanner walks known roots, records changed files and removes catalogue entries only after a complete successful traversal. Permission failures should produce a partial-scan state. Treating an unreadable folder as empty would turn an access problem into apparent deletion. Keep the previous catalogue until the new transaction commits. A log summary includes roots visited and whether the scan covered each root completely.

## Moving hardware

After replacing a disk, check cabling, filesystem health and free space. Device names such as /dev/sdb can change when another drive is connected. Mount points are ordinary directories before a filesystem is attached. An automated job may therefore see a perfectly readable but empty directory while the intended archive is absent. This is easy to confuse with a legitimate removal of all photographs.

## Before enabling cleanup

Bind the archive configuration to the expected filesystem UUID and a marker file stored on that filesystem. Before scanning, verify the mounted UUID and the marker, not just whether the mount-point directory exists. If either is missing or different, stop without deleting catalogue entries. Update the expected identity explicitly after a verified disk replacement. A symlink pointing to the old mount path does not establish that the correct volume is mounted.

Run one read-only reconciliation after migration and compare file counts and sampled checksums with the previous inventory. Only then enable removal of truly missing entries. A new empty directory created by an installer is not an empty archive. The gate protects metadata even when the storage problem itself cannot be fixed automatically.

## Recovery practice

Keep a written mount layout with backup locations, but do not place recovery secrets in the catalogue. Test recovery into a different directory. The local index is disposable and can be rebuilt once the archive identity is verified. A failed migration should leave both the original files and the previous catalogue available for inspection.
