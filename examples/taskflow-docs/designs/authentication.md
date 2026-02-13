---
title: Authentication and Authorization
doc_type: design
source_refs:
  - src/auth/jwt.ts
  - src/auth/oauth.ts
  - src/middleware/authMiddleware.ts
---

# Authentication and Authorization

## Overview

TaskFlow uses a **token-based authentication** system built on JSON Web Tokens (JWT) with support for OAuth2 social login providers. Authorization is enforced through a **role-based access control (RBAC)** model that operates at both the system level and the project level.

All authenticated requests must include a valid access token in the `Authorization` header. The system issues short-lived access tokens paired with longer-lived refresh tokens to balance security with user experience.

Related documents:

- [[adrs/002-auth-strategy|references]]
- [[api/rest-endpoints|depends_on]]

## Authentication Flow

The system supports two primary authentication paths: email/password and OAuth2. Both paths converge at JWT issuance.

### Email/Password Flow

```
Client                    API                     AuthService              Database
  │                        │                          │                       │
  │  POST /auth/login      │                          │                       │
  │  { email, password }   │                          │                       │
  │───────────────────────►│                          │                       │
  │                        │  authenticate(email, pw) │                       │
  │                        │─────────────────────────►│                       │
  │                        │                          │  SELECT by email      │
  │                        │                          │──────────────────────►│
  │                        │                          │  user record          │
  │                        │                          │◄──────────────────────│
  │                        │                          │                       │
  │                        │                          │  verify(pw, hash)     │
  │                        │                          │  (Argon2id)           │
  │                        │                          │                       │
  │                        │  { accessToken,          │                       │
  │                        │    refreshToken }        │                       │
  │                        │◄─────────────────────────│                       │
  │  200 OK                │                          │                       │
  │  { accessToken,        │                          │                       │
  │    refreshToken }      │                          │                       │
  │◄───────────────────────│                          │                       │
```

### Registration Flow

New accounts created via email/password go through the following steps:

1. Client submits `POST /auth/register` with `{ email, displayName, password }`
2. AuthService validates the email is unique and the password meets complexity requirements
3. Password is hashed using Argon2id with recommended parameters
4. A new user record is inserted with `role: 'member'` and `status: 'active'`
5. An access/refresh token pair is issued and returned

### Password Hashing Parameters

```typescript
const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536,    // 64 MB
  timeCost: 3,          // 3 iterations
  parallelism: 4,       // 4 threads
  hashLength: 32,       // 32-byte output
};
```

## JWT Token Design

### Access Token

The access token is a short-lived JWT that carries the claims needed for authorization decisions. It is included in every authenticated request.

**Header:**
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-2024-01"
}
```

**Payload:**
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "alice@example.com",
  "role": "manager",
  "iat": 1700000000,
  "exp": 1700000900,
  "iss": "taskflow",
  "aud": "taskflow-api"
}
```

| Claim   | Description                          | Value                  |
|---------|--------------------------------------|------------------------|
| `sub`   | User ID (UUID)                       | From `users.id`        |
| `email` | User email address                   | From `users.email`     |
| `role`  | System-level role                    | admin / manager / member / guest |
| `iat`   | Issued at (Unix timestamp)           | Current time           |
| `exp`   | Expiration (Unix timestamp)          | `iat` + 15 minutes     |
| `iss`   | Issuer                               | `taskflow`             |
| `aud`   | Audience                             | `taskflow-api`         |

Access tokens are signed with RS256 using a 2048-bit RSA key pair. The public key is available at `GET /.well-known/jwks.json` for external services that need to verify tokens.

### Refresh Token

The refresh token is an opaque, cryptographically random string (64 bytes, base64url-encoded) stored in the database alongside a SHA-256 hash for lookup. Refresh tokens are **not** JWTs.

| Property      | Value           |
|---------------|-----------------|
| Format        | Opaque string   |
| Length         | 64 bytes (86 chars base64url) |
| Storage       | Hashed (SHA-256) in `refresh_tokens` table |
| Lifetime      | 30 days         |
| Rotation      | On every use    |
| Revocation    | Immediate via deletion |

## OAuth2 Integration

TaskFlow supports Google and GitHub as OAuth2 providers. The flow uses the Authorization Code Grant with PKCE for enhanced security.

```
Client                    TaskFlow API              OAuth Provider
  │                          │                          │
  │  GET /auth/oauth/google  │                          │
  │─────────────────────────►│                          │
  │                          │  Generate state + PKCE   │
  │  302 Redirect            │                          │
  │  Location: google.com/   │                          │
  │    oauth?client_id=...   │                          │
  │    &state=...            │                          │
  │    &code_challenge=...   │                          │
  │◄─────────────────────────│                          │
  │                          │                          │
  │  (User authenticates     │                          │
  │   with Google)           │                          │
  │                          │                          │
  │  GET /auth/oauth/callback│                          │
  │  ?code=abc&state=xyz     │                          │
  │─────────────────────────►│                          │
  │                          │  POST /token             │
  │                          │  { code, code_verifier } │
  │                          │─────────────────────────►│
  │                          │  { access_token, ... }   │
  │                          │◄─────────────────────────│
  │                          │                          │
  │                          │  GET /userinfo            │
  │                          │─────────────────────────►│
  │                          │  { email, name, ... }    │
  │                          │◄─────────────────────────│
  │                          │                          │
  │                          │  Find or create user     │
  │                          │  Issue JWT pair           │
  │  200 { accessToken,      │                          │
  │        refreshToken }    │                          │
  │◄─────────────────────────│                          │
```

### Provider Configuration

| Provider | Client ID Source     | Scopes                         | User Info Endpoint                    |
|----------|----------------------|--------------------------------|---------------------------------------|
| Google   | `GOOGLE_CLIENT_ID`   | `openid email profile`         | `https://www.googleapis.com/oauth2/v3/userinfo` |
| GitHub   | `GITHUB_CLIENT_ID`   | `user:email read:user`         | `https://api.github.com/user`         |

When an OAuth user logs in for the first time, a new user record is created with `password_hash = NULL`. If a user with the same email already exists (registered via email/password), the OAuth identity is linked to the existing account.

## Role-Based Access Control

Authorization is enforced at two levels:

1. **System roles**: Assigned in the `users.role` column. Govern access to administrative functions.
2. **Project roles**: Assigned in the `project_members.role` column. Govern access within a specific project.

### System Roles

| Role      | Description                                     |
|-----------|-------------------------------------------------|
| `admin`   | Full system access. Can manage users, view all projects, and configure system settings. |
| `manager` | Can create projects and manage members within their own projects. |
| `member`  | Standard user. Can be invited to projects and work on tasks. |
| `guest`   | Read-only access to projects they are invited to. Cannot create projects or tasks. |

### Project Roles

| Role      | Description                                     |
|-----------|-------------------------------------------------|
| `admin`   | Full control over the project. Can change settings, manage members, and delete the project. |
| `member`  | Can create, edit, and assign tasks. Can comment on any task in the project. |
| `viewer`  | Read-only access. Can view tasks and comments but cannot make changes. |

## Permission Matrix

The following matrix defines which actions are allowed for each combination of system role and project role. A check mark indicates the action is permitted.

### System-Level Permissions

| Action                    | admin | manager | member | guest |
|---------------------------|:-----:|:-------:|:------:|:-----:|
| Create project            |   Y   |    Y    |   N    |   N   |
| View all projects         |   Y   |    N    |   N    |   N   |
| Manage users              |   Y   |    N    |   N    |   N   |
| View system settings      |   Y   |    N    |   N    |   N   |
| Modify system settings    |   Y   |    N    |   N    |   N   |

### Project-Level Permissions

| Action                    | project admin | project member | project viewer |
|---------------------------|:------------:|:--------------:|:--------------:|
| View project              |      Y       |       Y        |       Y        |
| Edit project settings     |      Y       |       N        |       N        |
| Delete project            |      Y       |       N        |       N        |
| Manage members            |      Y       |       N        |       N        |
| Create task               |      Y       |       Y        |       N        |
| Edit any task             |      Y       |       Y        |       N        |
| Assign task               |      Y       |       Y        |       N        |
| Change task status        |      Y       |       Y        |       N        |
| Delete task               |      Y       |       N        |       N        |
| Add comment               |      Y       |       Y        |       N        |
| Edit own comment          |      Y       |       Y        |       N        |
| Delete any comment        |      Y       |       N        |       N        |

### Authorization Middleware

The `authMiddleware.ts` module exposes two Express middleware factories:

```typescript
// System-level role check
function requireRole(...roles: SystemRole[]): RequestHandler;

// Project-level role check (reads projectId from req.params)
function requireProjectRole(...roles: ProjectRole[]): RequestHandler;
```

These are applied at the route level:

```typescript
router.delete(
  '/projects/:projectId',
  requireRole('admin', 'manager'),
  requireProjectRole('admin'),
  projectController.delete
);
```

## Token Refresh Strategy

Access tokens expire after 15 minutes. Clients use the refresh token to obtain a new access/refresh token pair without requiring the user to re-authenticate.

### Refresh Flow

1. Client sends `POST /auth/refresh` with `{ refreshToken }`
2. Server looks up the token hash in the `refresh_tokens` table
3. If found and not expired, a new access token and a new refresh token are issued
4. The old refresh token is deleted (rotation)
5. The new tokens are returned to the client

### Refresh Token Rotation

Every successful refresh operation invalidates the used token and issues a new one. This limits the window of exposure if a refresh token is compromised.

If a previously rotated (invalidated) refresh token is presented, this indicates potential token theft. In this case, **all refresh tokens for that user are revoked**, forcing a full re-authentication.

```
Normal flow:
  RT_1 ──(refresh)──► RT_2 ──(refresh)──► RT_3

Theft detection:
  RT_1 ──(refresh)──► RT_2     (legitimate client gets RT_2)
          │
          └──(replay RT_1)──► REVOKE ALL (RT_2 also invalidated)
```

### Token Storage on Client

| Token          | Storage Location            | Rationale                          |
|----------------|-----------------------------|------------------------------------|
| Access token   | In-memory (JavaScript var)  | Never persisted; lost on page close |
| Refresh token  | HttpOnly secure cookie      | Not accessible to JavaScript; survives page reload |

## Security Considerations

### Transport Security

- All endpoints require HTTPS in production. HTTP requests receive a 301 redirect.
- The `Strict-Transport-Security` header is set with a 1-year `max-age` and `includeSubDomains`.

### Token Security

- Access tokens use RS256 asymmetric signatures, allowing verification without sharing the private key.
- Key rotation is supported via the `kid` header claim. Old keys remain valid for verification until their last issued token expires.
- Refresh tokens are stored as SHA-256 hashes. Even if the database is compromised, the raw tokens cannot be recovered.

### Rate Limiting

Authentication endpoints have stricter rate limits than general API endpoints:

| Endpoint              | Rate Limit          | Lockout                        |
|-----------------------|---------------------|--------------------------------|
| `POST /auth/login`    | 5 per minute per IP | 15-minute lockout after 10 failures |
| `POST /auth/register` | 3 per minute per IP | N/A                            |
| `POST /auth/refresh`  | 10 per minute per user | N/A                         |
| `POST /auth/oauth/*`  | 10 per minute per IP | N/A                           |

### Additional Protections

- **CSRF**: The API is stateless and does not use cookies for authentication of API requests. The refresh token cookie is `SameSite=Strict`.
- **Timing attacks**: Password verification uses constant-time comparison via the Argon2 library.
- **Account enumeration**: Login and registration endpoints return identical error messages for "user not found" and "wrong password" scenarios.
- **Token size**: Access tokens are kept under 1 KB to avoid issues with header size limits on proxies and CDNs.
