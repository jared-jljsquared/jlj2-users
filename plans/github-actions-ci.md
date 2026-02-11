# Plan: Add CI GitHub Action

## Goal
Run lint, build, and test tasks automatically for every pull request push so merges are blocked unless they pass.

## Steps
1. **Review existing scripts** – confirm pnpm commands for lint (`pnpm check`), build (`pnpm build`), and tests (`pnpm test`). Note dependencies on pnpm, Node version, and cache strategy.
2. **Create workflow file** – add `.github/workflows/ci.yml` triggered on `pull_request` (pushes to PRs). Configure environment (checkout code, setup pnpm + Node 20, install dependencies).
3. **Add jobs** – single job running lint, build, and test sequentially with clear step names so branch protection can target the workflow/job.
4. **Document/verify** – ensure workflow references pnpm scripts correctly and mention that branch protection should require this workflow for merges.
