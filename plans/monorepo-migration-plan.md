# Monorepo Migration Plan

**Date:** 2026-02-20  
**Status:** Draft  
**Goal:** Convert jlj2-users into a monorepo with jlj2-authentication (renamed) and jlj2-authorization (new).

---

## Target Structure

```
jlj2-users/                    # Repo root (consider renaming to jlj2-identity or jlj2-auth)
├── package.json               # Root workspace config (pnpm workspaces)
├── pnpm-workspace.yaml
├── tsconfig.base.json         # Shared TypeScript config
├── biome.json                 # Shared lint config (or per-package)
├── .gitignore
├── README.md
├── plans/                     # Shared plans directory (root level)
│   ├── README.md
│   ├── completed/
│   └── ...
├── packages/
│   ├── jlj2-authentication/   # Renamed from current app
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── auth/
│   │   │   ├── clients/
│   │   │   ├── database/
│   │   │   ├── flows/
│   │   │   ├── middleware/
│   │   │   ├── oidc/
│   │   │   ├── plumbing/
│   │   │   ├── providers/
│   │   │   ├── tokens/
│   │   │   ├── types/
│   │   │   └── users/
│   │   ├── tests/
│   │   └── docs/
│   │
│   └── jlj2-authorization/    # New app (scaffold)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── src/
│       │   ├── app.ts
│       │   └── ...            # Same folder structure, minimal scaffold
│       ├── tests/
│       └── docs/
```

---

## Phase 1: Monorepo Foundation

### 1.1 Create Root Workspace

- [x] Add `pnpm-workspace.yaml` with `packages: ['packages/*']`
- [x] Create root `package.json` with workspace scripts (`pnpm -r run build`, etc.)
- [x] Create `tsconfig.base.json` for shared compiler options
- [ ] Update root `.gitignore` if needed
- [ ] Update root `README.md` to describe monorepo

### 1.2 Create packages/ Directory

- [x] Create `packages/` directory

---

## Phase 2: Move and Rename jlj2-users → jlj2-authentication

### 2.1 Move Source to packages/jlj2-authentication

- [x] Create `packages/jlj2-authentication/`
- [x] Move `src/`, `tests/`, `docs/` into `packages/jlj2-authentication/`
- [ ] **Keep `plans/` at root** – do not move into packages
- [ ] Move config files: `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `biome.json` (or inherit from root)
- [ ] Move `docker-compose*.yml`, `README-SCYLLA.md` if present
- [ ] Move `scripts/` if present

### 2.2 Update jlj2-authentication package.json

- [ ] Change `name` to `jlj2-authentication`
- [ ] Update `description` to reflect authentication service
- [ ] Update paths in scripts (`src/app.ts` → relative paths)
- [ ] Add `"private": true` if internal package
- [ ] Ensure dependencies are correct

### 2.3 Update jlj2-authentication Config Paths

- [ ] Update `tsconfig.json` to extend `../../tsconfig.base.json` and fix include paths
- [ ] Update `vitest.config.ts` paths if needed
- [ ] Update any import paths that reference package name

### 2.4 Remove Moved Files from Root

- [ ] Delete original `src/`, `tests/`, `docs/` from root
- [ ] Delete original `tsconfig.json`, `vitest.config.ts`, etc. from root
- [ ] **Keep `plans/` at root** – shared across all packages
- [ ] Keep only monorepo root files

### 2.4.1 Plans Directory Structure

- [ ] Ensure `plans/` remains at repo root with `README.md` and `completed/`
- [ ] Update any plan references that pointed to package-relative paths (e.g. `./completed/` stays valid)

---

## Phase 2.5: Table Prefixing (jlj2-authentication)

**Prerequisite:** Phase 2 complete. **Goal:** All tables use `auth_` prefix; keyspace defaults to `jlj2_authentication`.

### 2.5.1 Keyspace Update

- [ ] Change default keyspace from `jlj2_users` to `jlj2_authentication` in database config
- [ ] Add migration to create `jlj2_authentication` keyspace if using new keyspace (or keep `jlj2_users` and add prefixed tables—decide per strategy)

### 2.5.2 Table Migrations

- [ ] Create migrations for each `auth_*` table (copy schema from existing, new name)
- [ ] Add data migration steps: `INSERT INTO auth_X SELECT * FROM X`
- [ ] Add rollback: drop `auth_*` tables
- [ ] Add migrations to drop old unprefixed tables (after code is updated)

### 2.5.3 Code Updates

- [ ] Update all CQL queries in: `database/migrations/`, `users/storage.ts`, `clients/storage.ts`, `flows/*-storage.ts`, `auth/oauth-state-storage.ts`, `middleware/rate-limit-storage.ts`
- [ ] Update test mocks that reference keyspace/table names
- [ ] Update `docs/deployment.md` and `README-SCYLLA.md` with new keyspace and table names

---

## Phase 3: Create jlj2-authorization Scaffold

### 3.1 Create Package Structure

- [ ] Create `packages/jlj2-authorization/package.json` (name, scripts, deps)
- [ ] Create `packages/jlj2-authorization/tsconfig.json`
- [ ] Create `packages/jlj2-authorization/vitest.config.ts`

### 3.2 Create Folder Structure (Mirror jlj2-authentication)

- [ ] Create `src/app.ts` – minimal Hono app
- [ ] Create `src/` subdirs: `auth/`, `clients/`, `database/`, `flows/`, `middleware/`, `oidc/`, `plumbing/`, `tokens/`, `types/`
- [ ] Create `tests/` directory
- [ ] Create `docs/` directory
- [ ] **No `plans/` in package** – use root-level `plans/` for all plans

### 3.3 Minimal jlj2-authorization Implementation

- [ ] `src/app.ts` – Hono app with health check, about
- [ ] Add `README.md` describing authorization service purpose
- [ ] Database config: default keyspace `jlj2_authorization`, all tables use `authz_` prefix from the start

---

## Phase 4: Root-Level Updates

### 4.1 Root package.json Scripts

- [x] `build`: `pnpm -r run build`
- [x] `test`: `pnpm -r run test`
- [x] `dev:auth`: `pnpm --filter jlj2-authentication run dev`
- [x] `migrate`: `pnpm --filter jlj2-authentication run migrate`
- [ ] `dev:authz`: `pnpm --filter jlj2-authorization run dev` (when authz exists)
- [x] `lint`: `pnpm -r run lint` or root biome
- [x] `check`: `pnpm -r run check`

### 4.2 Shared Configuration

- [ ] Decide: single `biome.json` at root or per-package
- [ ] Decide: single `tsconfig.base.json` or per-package extends
- [ ] Update `.cursor/rules` if paths change

---

## Phase 5: Verification

### 5.1 Build and Test

- [ ] `pnpm install` at root
- [ ] `pnpm build` – both packages build
- [ ] `pnpm test` – both packages tests pass
- [ ] `pnpm run dev:auth` – authentication service starts

### 5.2 Documentation

- [ ] Update root README with monorepo structure
- [ ] Document how to run each service
- [ ] Document relationship between authentication and authorization

---

## Decisions (Confirmed)

### Plans Directory: Root Level

- **Location:** `plans/` stays at the repo root, shared across all packages.
- **Rationale:** Single place for implementation plans, completed steps, and cross-cutting documentation. Plans often span multiple packages (e.g. monorepo migration, database schema).
- **No per-package plans:** Neither `packages/jlj2-authentication/` nor `packages/jlj2-authorization/` will have a `plans/` subdirectory.

### Database: Shared ScyllaDB, Separate Keyspaces

- **Same cluster:** Both jlj2-authentication and jlj2-authorization connect to the same ScyllaDB cluster (same hosts, port, credentials).
- **Separate keyspaces:** Each app uses its own keyspace:
  - **jlj2-authentication:** `jlj2_authentication` (default; configurable via `SCYLLA_KEYSPACE`)
  - **jlj2-authorization:** `jlj2_authorization` (default; configurable via `SCYLLA_KEYSPACE`)

### Table Name Prefixing

All table names must use a consistent prefix to identify the owning service. This aids schema clarity and avoids collisions if keyspaces are ever merged or inspected.

**jlj2-authentication tables** – prefix: `auth_`

| Current Table | Prefixed Table |
|---------------|----------------|
| migration_history | auth_migration_history |
| accounts | auth_accounts |
| contact_methods | auth_contact_methods |
| contact_methods_by_account | auth_contact_methods_by_account |
| contact_methods_by_id | auth_contact_methods_by_id |
| identities | auth_identities |
| identity_accounts | auth_identity_accounts |
| account_identities | auth_account_identities |
| magic_link_tokens | auth_magic_link_tokens |
| provider_accounts | auth_provider_accounts |
| clients | auth_clients |
| authorization_codes | auth_authorization_codes |
| refresh_tokens | auth_refresh_tokens |
| refresh_tokens_by_user | auth_refresh_tokens_by_user |
| oauth_state | auth_oauth_state |
| rate_limit_counters | auth_rate_limit_counters |

**jlj2-authorization tables** – prefix: `authz_` (to be defined when schema is created)

Examples: `authz_migration_history`, `authz_permissions`, `authz_roles`, etc.

### Implementation Impact

- [ ] **Phase 2.5:** Add migration(s) to rename existing jlj2-authentication tables to `auth_*` (or create new tables and migrate data)
- [ ] Update all CQL queries in authentication service to use prefixed table names
- [ ] Update default keyspace from `jlj2_users` to `jlj2_authentication`
- [ ] jlj2-authorization: use `authz_` prefix for all tables from the start

---

## Decisions to Make

1. **Repo name:** Keep `jlj2-users` or rename repo to `jlj2-identity`, `jlj2-auth`, etc.?
2. **Shared packages:** Will auth and authorization share code? If so, consider `packages/shared/` or `packages/common/`.
3. **jlj2-authorization scope:** What does the authorization service do? (e.g., policy enforcement, RBAC, permissions API)
4. **Table rename strategy:** ScyllaDB does not support `ALTER TABLE RENAME`. Strategy: create new `auth_*` tables, migrate data, drop old tables, update application code. This will be new migrations (e.g. 020–036) in jlj2-authentication.

---

## Execution Order

1. Phase 1 – Monorepo foundation
2. Phase 2 – Move and rename authentication (before table prefixing)
3. **Phase 2.5** – Table prefixing: add migrations to create `auth_*` tables, migrate data, drop old tables, update all CQL references
4. Phase 4 – Root scripts (so we can verify)
5. Phase 3 – Create authorization scaffold (with `authz_` prefix from start)
6. Phase 5 – Verification
