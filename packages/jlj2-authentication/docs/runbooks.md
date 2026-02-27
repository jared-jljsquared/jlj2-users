# Operational Runbooks

## Health Check Interpretation

### GET /health

**Response: `status: ok`**
- Service is healthy
- Database connection is working

**Response: `status: degraded`**
- Database connection failed or unhealthy
- Check ScyllaDB availability and connectivity
- Review `checks.database` for details

**Action:** If degraded, see [Database Unavailable](#database-unavailable).

---

## Common Failure Scenarios

### Database Unavailable

**Symptoms:** `/health` returns `degraded`, startup fails, or token/authorization operations fail.

**Remediation:**
1. Verify ScyllaDB is running: `docker-compose ps` (local) or cluster status (production)
2. Check connectivity: `cqlsh {SCYLLA_HOSTS} {SCYLLA_PORT}`
3. Verify credentials if `SCYLLA_USERNAME`/`SCYLLA_PASSWORD` are set
4. Check network/firewall rules
5. Review application logs for connection errors

### Token Endpoint Errors

**`invalid_grant`** – Authorization code or refresh token invalid/expired.
- **Cause:** Code already used, expired, or wrong client/redirect_uri
- **Action:** Client should restart authorization flow or request new refresh

**`invalid_client`** – Client authentication failed.
- **Cause:** Wrong client_id/secret, or public client using refresh_token without auth
- **Action:** Verify client credentials; ensure confidential clients send Authorization header or form credentials

**`server_error`** – Internal error (e.g., user not found).
- **Action:** Check logs; may indicate data inconsistency

### Rate Limiting (429)

**Symptoms:** Clients receive 429 Too Many Requests.

**Remediation:**
1. Adjust `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS` if limits are too strict
2. Ensure `RATE_LIMIT_TRUST_CF_CONNECTING_IP` is set when behind Cloudflare (to avoid counting all traffic as one IP)
3. Rate limit storage uses ScyllaDB; verify DB is healthy

### External Provider Failures

**Symptoms:** Google/Microsoft/Facebook/X sign-in fails; users redirected to login with error.

**Remediation:**
1. Verify provider credentials (`GOOGLE_CLIENT_ID`, etc.) are set and correct
2. Check redirect URIs match provider console configuration
3. Ensure provider app is not in sandbox/development mode if needed for production
4. Review security logs for `auth_failure` events with provider and reason

---

## Key Rotation Procedure

Keys are stored in `signing_keys` table. The application uses the latest active key for signing; old keys remain valid for verification until retired.

### Manual Rotation (if needed)

1. **Generate new key:** Use key management utilities or add a migration that inserts a new key
2. **Deploy:** New key is used for signing; existing tokens still verify with old keys
3. **Retire old keys:** After tokens using old keys have expired (e.g., 1 hour for access tokens), retire keys via key management or migration

### Verification

- JWKS endpoint `/.well-known/jwks.json` returns all active keys
- Clients should cache JWKS and refresh periodically

---

## Incident Response

### Token Compromise

If access or refresh tokens are compromised:

1. **Revoke refresh tokens:** Use revocation endpoint; clients with compromised refresh tokens will fail on next refresh
2. **Short-lived access tokens:** Access tokens expire in 1 hour; impact is limited
3. **User-wide revocation:** Use `revokeRefreshTokensByUser(clientId, userId)` to revoke all refresh tokens for a user (requires code/integration)
4. **Rotate signing keys:** If private key is compromised, generate new key and retire compromised key; all existing tokens become invalid

### Provider Outage

If Google, Microsoft, Facebook, or X is unavailable:

1. **User impact:** Users cannot sign in with that provider
2. **Password login:** Still available if users have registered with email/password
3. **Monitoring:** Watch for `auth_failure` events with provider name
4. **No code change needed:** Provider outages are transient; retry by user is sufficient

### OIDC Issuer URL Change

If the public URL of the service changes:

1. Update `OIDC_ISSUER` environment variable
2. Update redirect URIs in all OAuth client registrations (Google, Microsoft, etc.)
3. Update registered OAuth clients' redirect_uri configuration
4. Restart the service
5. **Note:** Existing tokens will have old `iss` claim; resource servers may reject until tokens expire. Plan for brief disruption or coordinate with clients.

---

## Security Logging

The application logs security events (no tokens or secrets):

- `auth_success` / `auth_failure` – Login attempts
- `token_issued` – Token issuance (authorization_code or refresh_token grant)
- `token_revoked` – Revocation requests

Use these logs for:
- Auditing authentication events
- Detecting brute force (many `auth_failure` for same user/provider)
- Investigating token-related incidents
