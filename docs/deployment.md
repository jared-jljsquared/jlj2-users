# Deployment Guide

## Prerequisites

- Node.js 18+
- ScyllaDB (or Cassandra-compatible cluster)
- HTTPS in production (required for OIDC)

---

## Environment Variables

### OIDC Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OIDC_ISSUER` | `http://localhost:{PORT}` | Issuer URL (must match public URL; use HTTPS in production) |
| `OIDC_DEFAULT_AUDIENCE` | `jlj-squared-development` | Default audience for tokens |
| `PORT` | `3000` | Server port |

### ScyllaDB

| Variable | Default | Description |
|----------|---------|-------------|
| `SCYLLA_HOSTS` | `localhost` | Comma-separated host list |
| `SCYLLA_PORT` | `9042` | CQL native port |
| `SCYLLA_KEYSPACE` | `jlj2_users` | Keyspace name |
| `SCYLLA_LOCAL_DATACENTER` | `datacenter1` | Local datacenter for routing |
| `SCYLLA_USERNAME` | - | Username (if auth enabled) |
| `SCYLLA_PASSWORD` | - | Password (if auth enabled) |
| `SCYLLA_SSL` | `false` | Set `true` for TLS |
| `SCYLLA_CONNECT_TIMEOUT_MS` | - | Connection timeout (ms) |
| `SCYLLA_CONNECT_RETRIES` | - | Retry count |
| `SCYLLA_CONNECT_RETRY_DELAY_MS` | - | Delay between retries (ms) |
| `SCYLLA_DISABLED` | - | Set `true` to disable DB (dev only) |

### External Providers

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `MICROSOFT_CLIENT_ID` | Microsoft app (client) ID |
| `MICROSOFT_CLIENT_SECRET` | Microsoft client secret |
| `MICROSOFT_TENANT` | Tenant ID (`common`, `organizations`, or specific) |
| `MICROSOFT_API_VERSION` | API version (default `v2.0`) |
| `FACEBOOK_APP_ID` | Facebook App ID |
| `FACEBOOK_APP_SECRET` | Facebook App Secret |
| `FACEBOOK_GRAPH_VERSION` | Graph API version (default `v21.0`) |
| `X_CLIENT_ID` | X (Twitter) OAuth 2.0 client ID |
| `X_CLIENT_SECRET` | X OAuth 2.0 client secret |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_WINDOW_MS` | `60000` | Window in milliseconds |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window per IP |
| `RATE_LIMIT_TRUST_CF_CONNECTING_IP` | `false` | Set `true` when behind Cloudflare |

### Other

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `production` for HTTPS enforcement |

---

## Database Setup

### 1. Start ScyllaDB

See [README-SCYLLA.md](../README-SCYLLA.md) for local Docker setup.

For production, use a managed ScyllaDB/Cassandra service or self-hosted cluster.

### 2. Run Migrations

```bash
pnpm migrate
```

This creates the keyspace, tables, and indexes. Migrations are versioned and idempotent.

### 3. Verify

```bash
pnpm db:version
```

---

## Key Management

Keys are stored in ScyllaDB (`signing_keys` table). On first run, a default RS256 key is generated.

**Key rotation:** Keys are automatically managed. Old keys remain active until retired. Use the key management API or migration scripts for manual rotation.

---

## Provider Configuration

### Google

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Google+ API (or People API)
3. Create OAuth 2.0 credentials (Web application)
4. Add authorized redirect URI: `{OIDC_ISSUER}/auth/google/callback`
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

### Microsoft

1. Register app in [Azure Portal](https://portal.azure.com/) → Microsoft Entra ID → App registrations
2. Add redirect URI: `{OIDC_ISSUER}/auth/microsoft/callback`
3. Create client secret
4. Set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT`

### Facebook

1. Create app in [Facebook Developers](https://developers.facebook.com/)
2. Add Facebook Login product
3. Set Valid OAuth Redirect URIs: `{OIDC_ISSUER}/auth/facebook/callback`
4. Set `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`

### X (Twitter)

1. Create project in [X Developer Portal](https://developer.twitter.com/)
2. Add OAuth 2.0 redirect URI: `{OIDC_ISSUER}/auth/x/callback`
3. Set `X_CLIENT_ID`, `X_CLIENT_SECRET`

---

## HTTPS / TLS

In production (`NODE_ENV=production`), the app enforces HTTPS. Ensure:

1. `OIDC_ISSUER` uses `https://`
2. A reverse proxy (nginx, Caddy, Cloudflare) terminates TLS
3. `x-forwarded-proto: https` is set when behind a proxy

---

## Build and Run

```bash
pnpm install
pnpm build
pnpm start
```

Or with tsx for development:

```bash
pnpm dev
```

---

## Client Registration

Before clients can use the authorization flow, register them:

```bash
curl -X POST http://localhost:3000/clients \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My App",
    "redirectUris": ["https://myapp.example.com/callback"],
    "grantTypes": ["authorization_code", "refresh_token"],
    "responseTypes": ["code"],
    "scopes": ["openid", "profile", "email", "offline_access"],
    "tokenEndpointAuthMethod": "client_secret_post"
  }'
```

Store the returned `secret` securely; it is only shown once.
