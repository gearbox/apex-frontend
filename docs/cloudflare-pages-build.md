# Cloudflare build environment

Use the same runtime in **both Production and Preview** environments:

| Setting | Value |
| --- | --- |
| `NODE_VERSION` | `24.18.0` |
| `PNPM_VERSION` | `10.32.0` |

`.node-version` is the repository source of truth. The project requires Node.js 24 LTS,
with `24.15.0` as its minimum compatible patch because jsdom 30 requires it. Cloudflare
does not infer a Node or pnpm version from `package.json`; set these dashboard values
explicitly when recreating a project or environment. Node.js 20 is intentionally unsupported.

## Workers Builds (current deployment)

This project is deployed through **Cloudflare Workers Builds**, not a Cloudflare Pages
project. The separate production deploy command and non-production version command identify
this workflow. `wrangler.jsonc` uploads the Vite output in `./build` as static Worker assets
and configures SPA fallback handling.

| Setting | Value |
| --- | --- |
| Build command | `pnpm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler versions upload` |
| Root directory | `/` |

Workers Builds installs project dependencies automatically before running the build command.
Keep `pnpm run build` as the normal build command; `pnpm build` is equivalent in this project.
Do not add a second install command unless the install step needs to be explicitly controlled.

To enforce the lockfile install in the build command, add the build variable
`SKIP_DEPENDENCY_INSTALL=1` and use:

```sh
pnpm install --frozen-lockfile && pnpm build
```

Without `SKIP_DEPENDENCY_INSTALL`, this command repeats Cloudflare's automatic dependency
installation.

## Cloudflare Pages (only if the project is moved to Pages)

Set the build output directory to `build`. Pages also installs dependencies automatically, so
the usual build command is `pnpm run build`. Use the explicit frozen-lockfile command above
only together with `SKIP_DEPENDENCY_INSTALL=1` when a controlled install step is required.
