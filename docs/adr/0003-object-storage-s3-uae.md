# ADR-0003: Use AWS S3 in me-central-1 (UAE) for document storage

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-11-06 |
| **Deciders** | Product owner, tech lead |
| **PRD ref** | D-03 |

## Context

The app stores tenant files: supplier invoices, expense receipts, company logos and generated PDFs (invoices, quotations, receipts, statements). These are financial records, often containing customer names, TRNs and amounts. Requirements:

- Private storage; access only through short-lived signed URLs (5 minutes).
- Direct upload from the mobile app using pre-signed URLs, so files don't pass through the API.
- Per-tenant key prefixes (`tenants/{tenant_id}/…`).
- Versioning and lifecycle rules; separate buckets per environment.
- Reasonable cost; preference for UAE data residency given the target market and UAE PDPL.

## Options considered

1. **AWS S3, me-central-1 (UAE)**
   - Pros: data stored in the UAE; mature pre-signed URL support; versioning, object lock, lifecycle rules, server-side encryption, access logging; S3 is the reference API that every SDK supports.
   - Cons: egress charges for downloads; AWS account and IAM setup overhead.
2. **Cloudflare R2**
   - Pros: no egress fees; S3-compatible API; simple pricing.
   - Cons: no UAE location (data jurisdiction options are limited); fewer compliance features than S3.
3. **Google Cloud Storage, me-central1 (Doha) / me-central2 (Dammam)**
   - Pros: pairs well with Firebase.
   - Cons: not in the UAE; S3 compatibility is partial.

## Decision

Use **AWS S3 in me-central-1** with one private bucket per environment, behind a `StorageService` interface that uses the generic S3 API so another S3-compatible provider can be swapped in.

## Consequences

- Buckets: Block Public Access on, SSE-S3 (or SSE-KMS) encryption, versioning on in production, lifecycle rule deleting `pending` uploads after 24 h.
- The API's IAM role can only `PutObject`/`GetObject`/`HeadObject`/`DeleteObject` within the bucket; no listing.
- Pre-signed upload URLs pin content type and size limits; `confirm-upload` checks magic bytes before marking a document available.
- Download egress is a cost to watch; add usage alerts in AWS Budgets.
- **Related open point:** the Neon database region. Neon may not offer a UAE region. If UAE residency matters for the database too, record that as a separate ADR (options: nearest Neon region, or another managed Postgres in me-central-1).

## Revisit when

- Download egress becomes a significant cost (consider R2 or a CDN with signed URLs).
- Regulation requires a different residency arrangement.
