---
synthetic: true
---
# Mounting an extra disk

Create a mount point and mount the intended filesystem there before copying files. Device names may change after reboot, so persistent filesystem identifiers are useful in configuration. Check available capacity and permissions with a small disposable file.

Formatting a device destroys its old filesystem and belongs to initial setup, not routine recovery. This checklist does not define how an existing catalogue should react when its expected disk is missing. A directory's existence alone says little about which volume is attached to it.
