# Product deployments

Each product requires its own build and worker. For Synthara staging:

```sh
pnpm build:synthara && npx wrangler deploy --env synthara
```

For Cloudflare Workers Builds, set `VITE_PRODUCT_ID` separately for each worker.

Before release, create the Synthara worker and move the staging Synthara route or custom domain from `apex-vex-staging` to `apex-synthara-staging`; repeat for production when promoting. Verify the manifest name is `Synthara`, `/icon-512.png` shows the S mark, and `/app-version.json` contains the expected SHA. Reinstall on test devices. Android Chrome may prompt users to accept the identity update; on iOS users must remove and add the app again.
