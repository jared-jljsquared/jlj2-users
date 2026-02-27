# jlj2-users

Monorepo: OAuth 2.0 / OpenID Connect identity provider and authorization services.

## Packages

| Package | Description |
|---------|-------------|
| [jlj2-authentication](packages/jlj2-authentication) | User registration, login, OIDC flows |

## Quick Start

```bash
pnpm install
pnpm migrate up      # Run database migrations
pnpm dev:auth        # Start authentication service
```

## Documentation

| Document | Description |
|----------|-------------|
| [packages/jlj2-authentication/docs/api.md](packages/jlj2-authentication/docs/api.md) | API reference (endpoints, parameters, error codes) |
| [packages/jlj2-authentication/docs/deployment.md](packages/jlj2-authentication/docs/deployment.md) | Deployment guide (env vars, ScyllaDB, providers) |
| [packages/jlj2-authentication/docs/runbooks.md](packages/jlj2-authentication/docs/runbooks.md) | Operational runbooks (health, incidents, key rotation) |
| [packages/jlj2-authentication/docs/manual-test-scenarios.md](packages/jlj2-authentication/docs/manual-test-scenarios.md) | Manual test checklist |
| [packages/jlj2-authentication/docs/realms-evaluation.md](packages/jlj2-authentication/docs/realms-evaluation.md) | Realms/multi-tenant evaluation |
| [packages/jlj2-authentication/README-SCYLLA.md](packages/jlj2-authentication/README-SCYLLA.md) | ScyllaDB local setup |

## Session Cookie – SameSite=Lax

The session cookie uses `SameSite=Lax`. This is the correct choice for redirect-based OAuth/OIDC flows where multiple client websites redirect users to this service for authentication. With Lax, the cookie is sent on top-level navigations (e.g. link clicks, redirects), which covers the standard flow: client site → IdP → callback → redirect back to client.

Lax does not send the cookie for cross-site iframes or cross-origin fetch requests. If you need iframe-based silent auth or cross-origin fetch with credentials, you would need to evaluate `SameSite=None` with `Secure` (requires HTTPS).

## Token Middleware – requireAccessToken and requireScope

`requireAccessToken` and `requireScope` are kept separate by design. `requireAccessToken` validates the Bearer token and attaches the payload to context. `requireScope(scope)` checks that the token’s scope claim includes the required scope.

This separation supports services that operate in a space where tokens are already validated (e.g. behind an API gateway or proxy that validates tokens before forwarding). Those services may only see valid tokens but still need to enforce scope for authorization. In that case, they can use `requireScope` alone, with the payload already in context. When the service is the first to receive the request, use both: `requireAccessToken` then `requireScope`.

## Provider API Versions

Provider API versions are configurable via environment variables so you can upgrade when providers release new versions without code changes:

| Variable | Default | Description |
|----------|---------|-------------|
| `FACEBOOK_GRAPH_VERSION` | `v21.0` | Facebook Graph API version (e.g. `v22.0`, `v24.0`) |
| `MICROSOFT_API_VERSION` | `v2.0` | Microsoft identity platform API version |

## Release Notes (reverse chronological)

### 0.1.0

Initial commit
