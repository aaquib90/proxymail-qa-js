# Releasing

The source of truth is `packages/client` in Proxy Mail QA's main (private)
repository; this repo is its public copy, from which npm releases are built.

1. In the main repo, change `packages/client` and bump `version` in its
   `package.json`, then run `scripts/sync-client-repo.sh` to copy it here.
2. Commit and push here. CI runs the typecheck, tests and build.
3. Publish a GitHub release whose tag is `v` plus the version, for example
   `v0.1.1`: `gh release create v0.1.1 --title v0.1.1 --notes "…"`.
4. The "Publish to npm" workflow checks the tag matches `package.json`, builds,
   tests and publishes with npm trusted publishing, which adds provenance. npm
   validates each new version for a few minutes before it can be installed.

npm refuses to publish a version twice, so every release needs a new version.
