# ADR-0002: Use Firebase Authentication behind an AuthProvider interface

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-11-06 |
| **Deciders** | Product owner, tech lead |
| **PRD ref** | D-02 |

## Context

The PRD requires email/password registration, login and logout, password reset, email verification (AUTH-001 – AUTH-005), and a separate, MFA-protected login for Super Admins. The architecture says to use a managed provider behind an abstraction so it can be replaced later. The first client is Flutter on Android, then iOS, then a web portal.

Authorisation (tenant membership, roles, permissions) stays in our own database in every option. The provider only proves who the user is.

## Options considered

1. **Firebase Authentication** (optionally upgraded to Google Cloud Identity Platform)
   - Pros: first-party Flutter SDK for Android and iOS; built-in email verification and password-reset emails; token refresh handled by the SDK; backend verifies ID tokens with the Firebase Admin SDK; free or low cost at MVP volumes; Identity Platform adds MFA and multi-tenancy if needed.
   - Cons: user identity data is held by Google and not in a UAE region, so it must be covered in the privacy policy and checked against UAE PDPL; email templates and custom flows are less flexible; ties us to Google Cloud for this piece.
2. **Auth0**
   - Pros: very flexible; strong enterprise features (MFA, SSO, organisations); good admin tooling.
   - Cons: costs rise quickly with active users; Flutter support relies on a community SDK or web-based login.
3. **Clerk**
   - Pros: excellent web developer experience; good for the Next.js admin.
   - Cons: mobile/Flutter support weaker than web.
4. **Self-hosted (e.g. our own NestJS auth)**
   - Pros: full control, data stays where we choose.
   - Cons: we take on password storage, token security, email flows and breach risk. Not justified for MVP.

## Decision

Use **Firebase Authentication** for tenant users, behind an `AuthProvider` interface in `apps/api/src/infrastructure/auth-provider/`.

For Super Admins, use a **separate Firebase project (or Identity Platform tenant) with MFA enforced**, so admin and tenant tokens have different audiences and can't be used on each other's API.

## Consequences

- `users.auth_provider = 'firebase'`, `users.auth_provider_id = <firebase uid>`. Our `users.id` is used everywhere else; Firebase ids never appear in business tables.
- Backend guards verify tokens by checking signature, `aud`, `iss`, `exp`, and that `email_verified` is true for posting routes.
- Logout revokes refresh tokens through the Admin SDK.
- `/auth/register` and `/auth/login` may be thin or unnecessary because the SDK handles sign-in; `/auth/me` remains the source of profile and memberships.
- Privacy policy and the Play Store Data Safety form must disclose Firebase as a processor. Confirm with legal whether PDPL requires anything more.
- Separate Firebase projects per environment (dev, staging, prod).

## Revisit when

- A customer or regulator requires identity data to stay in the UAE.
- We need enterprise SSO (SAML/OIDC) for tenants.
- Monthly active users push costs above an alternative.
