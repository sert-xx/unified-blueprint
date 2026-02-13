---
title: "ADR-002: Authentication Strategy"
doc_type: adr
---

# ADR-002: Authentication Strategy

## Status

**Accepted** -- 2024-01-22

Supersedes: None
Amended by: None

## Context

TaskFlow needs a robust authentication mechanism that supports both first-party login (email/password) and third-party identity providers (Google, GitHub, Microsoft). The system must handle authentication for the web application, mobile clients, and a public REST API. Key requirements include:

- **Multi-client support**: Web SPA, iOS/Android apps, and third-party API consumers must all authenticate through a unified mechanism.
- **Stateless scalability**: The backend is designed as a horizontally scalable set of stateless API servers behind a load balancer. Avoiding server-side session state simplifies scaling.
- **Token refresh**: Long-lived sessions must be supported without requiring users to re-enter credentials frequently, while maintaining the ability to revoke access.
- **Third-party OAuth2**: Google Workspace and GitHub OAuth2 integrations are required for enterprise customers.
- **API key support**: Automation and CI/CD integrations require long-lived, scoped API keys.
- **Security compliance**: SOC 2 Type II certification is a target for Q3 2024, requiring auditable authentication events.

This decision directly affects session management, token storage, and the interaction between frontend and backend services.

## Decision Drivers

1. **Stateless architecture** -- Avoid centralized session stores to maintain horizontal scalability.
2. **Multi-platform support** -- A single auth mechanism that works across web, mobile, and API clients.
3. **Security posture** -- Tokens must be revocable, short-lived where possible, and resistant to common attack vectors (XSS, CSRF).
4. **Developer experience** -- Auth flow should be straightforward for frontend and mobile developers.
5. **Third-party integration** -- Must support OAuth2 authorization code flow with PKCE for third-party providers.
6. **Compliance** -- All authentication events must be auditable with timestamps, IP addresses, and user agent strings.

## Considered Options

| Criteria                    | JWT + OAuth2          | Session-based           | API Key Only          |
|-----------------------------|-----------------------|--------------------------|-----------------------|
| Stateless                   | Yes                   | No (requires session store) | Yes                |
| Multi-platform support      | Excellent             | Web-only (cookies)       | Good                  |
| Token revocation            | Requires denylist     | Immediate (delete session) | Immediate (delete key) |
| OAuth2 integration          | Native                | Requires adapter         | Not applicable        |
| Scalability overhead        | Minimal               | Session store required   | Minimal               |
| Security against XSS        | Moderate (storage-dependent) | Good (HttpOnly cookies) | Good (server-side) |
| Refresh mechanism           | Refresh tokens        | Session extension        | No expiry             |
| Compliance auditability     | Good (claims in token)| Good (server-side log)   | Limited               |
| Implementation complexity   | Moderate              | Low                      | Low                   |

### Option 1: JWT + OAuth2

Short-lived access tokens (JWTs) paired with longer-lived refresh tokens stored in HttpOnly cookies. OAuth2 authorization code flow with PKCE for third-party providers. Access tokens contain user claims and are verified without a database lookup on each request.

Advantages of this approach include stateless verification (only the public key is needed), native compatibility with OAuth2 flows, and the ability to embed authorization claims directly in the token. The primary tradeoff is that revocation is not immediate -- a compromised token remains valid until its short TTL expires unless an explicit denylist is maintained.

### Option 2: Session-based Authentication

Traditional server-side sessions stored in a centralized store (Redis or PostgreSQL). Session IDs transmitted via HttpOnly cookies. This approach provides immediate revocation but requires a shared session store, which conflicts with the stateless architecture goal and adds infrastructure complexity.

**Note**: This approach would require a centralized session store in PostgreSQL, adding load to the database that ADR-001 sized for application data, not session management. The stateless JWT approach avoids this additional database concern. Additionally, cookie-based sessions are difficult to use from mobile clients and third-party API consumers, which would require implementing a parallel authentication mechanism.

### Option 3: API Key Only

Long-lived API keys for all authentication. Simple to implement but lacks the security properties needed for user-facing authentication (no expiry, no refresh, no OAuth2 support). API keys are bearer tokens that grant access until explicitly revoked, making them unsuitable as the sole authentication mechanism for interactive users. They also lack the ability to carry claims or scopes without a database lookup on every request.

## Decision Outcome

**Chosen option: JWT + OAuth2**, because it best supports the stateless, multi-platform architecture while providing native OAuth2 integration for third-party identity providers.

Implementation details:

- **Access tokens**: JWTs with 15-minute expiry, signed with RS256. Contains user ID, workspace memberships, and role claims.
- **Refresh tokens**: Opaque tokens stored in HttpOnly, Secure, SameSite=Strict cookies with 7-day expiry. Stored hashed in PostgreSQL for revocation.
- **Token refresh**: Silent refresh via `/auth/refresh` endpoint. Refresh token rotation on each use with a grace period for concurrent requests.
- **OAuth2 providers**: Google and GitHub via authorization code flow with PKCE. Microsoft support planned for Q2 2024.
- **API keys**: Scoped, long-lived tokens for automation use cases. Stored hashed in PostgreSQL with last-used tracking.
- **Token denylist**: Redis-backed denylist for revoked access tokens that have not yet expired. TTL matches remaining token lifetime.
- **Audit logging**: All authentication events (login, logout, token refresh, failed attempts) logged to a dedicated `auth_events` table with IP, user agent, and timestamp.

## Consequences

### Positive

- **No session store dependency** for the primary auth flow reduces infrastructure complexity and improves horizontal scalability.
- **Multi-platform support** with a single auth mechanism simplifies client development across web, mobile, and API.
- **Native OAuth2 integration** provides a clean path for enterprise SSO requirements.
- **Token claims** reduce database lookups for authorization checks on each request.
- **Scoped API keys** enable fine-grained access control for automation and integration use cases.
- **Audit trail** built into the auth flow supports SOC 2 compliance requirements.

### Negative

- **Token revocation** is not immediate for access tokens; relies on short expiry (15 min) plus Redis denylist for critical revocations.
- **Token size** -- JWTs with role claims can be several hundred bytes, increasing request header size.
- **Key rotation complexity** -- RS256 key pairs must be rotated periodically, requiring a key management strategy.
- **Refresh token storage** still requires a database table, though with far less traffic than full session-based auth.
- **XSS risk** -- If access tokens are stored in JavaScript-accessible storage (localStorage), they are vulnerable to XSS. Mitigation: store in memory only, use refresh cookie for persistence.

### Related Documents

- [[designs/authentication|references]]
- [[adrs/001-database-choice|conflicts_with]]
