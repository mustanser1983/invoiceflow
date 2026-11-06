# Architecture Decision Records

Each ADR records one significant technical decision: the context, the options considered, the decision and its consequences.

**Statuses:** Proposed → Accepted (or Rejected) → later Superseded by ADR-NNNN.

An ADR becomes **Accepted** only when the product owner and tech lead approve it. To change an accepted decision, write a new ADR that supersedes it; never rewrite history in the old one.

| ADR | Title | Status | PRD ref |
|---|---|---|---|
| [0001](0001-orm-drizzle.md) | Use Drizzle ORM for database access and migrations | Proposed | D-01 |
| [0002](0002-auth-firebase.md) | Use Firebase Authentication behind an AuthProvider interface | Proposed | D-02 |
| [0003](0003-object-storage-s3-uae.md) | Use AWS S3 in me-central-1 (UAE) for document storage | Proposed | D-03 |

New ADRs: copy [template.md](template.md) to `NNNN-short-title.md`.
