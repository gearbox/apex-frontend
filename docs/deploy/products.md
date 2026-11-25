# Product deployments

Each product requires its own build and worker. Always run that product's build immediately before its deploy so the worker receives the matching assets and identity.

For Synthara staging:

```sh
pnpm build:synthara && npx wrangler deploy --env synthara
```

For Vex:

```sh
pnpm build:vex && npx wrangler deploy
```

To confirm that the Synthara environment inherits the top-level `assets` configuration, run:

```sh
npx wrangler deploy --env synthara --dry-run
```

For Cloudflare Workers Builds, set `VITE_PRODUCT_ID` separately for each worker.

Before release, create the Synthara worker and move the staging Synthara route or custom domain from `apex-vex-staging` to `apex-synthara-staging`; repeat for production when promoting. Verify the manifest name is `Synthara`, `/icon-512.png` shows the S mark, and `/app-version.json` contains the expected SHA. Reinstall on test devices. Android Chrome may prompt users to accept the identity update; on iOS users must remove and add the app again.
