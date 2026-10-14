---
synthetic: true
---
# Rejecting stale edits without a held lock

Read a record together with its revision. Submit the update with that expected revision, and make the database replace it only if the revision still matches. Increment the revision on success; zero affected rows means someone else changed the record and the editor must reload or merge.

This compare-and-swap pattern prevents a lost update without keeping a lock throughout a person's editing session. A timestamp with poor precision is a weak substitute for a revision counter. The conflict belongs in the user workflow; blindly retrying the old replacement would erase the protection.
