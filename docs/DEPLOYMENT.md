# Deploy FreeSki on Coolify

FreeSki builds to static files in `dist/`. Coolify can build the repository and serve those files with Nginx.

## Setup

1. Commit and push the version you want to deploy, including `package-lock.json` and `public/assets/production/`.
2. In your Coolify project, add an application from your Git repository and select the branch. Use a GitHub connection or deploy key for a private repository.
3. Choose **Nixpacks** as the build pack and configure:

   | Setting           | Value                                  |
   | ----------------- | -------------------------------------- |
   | Base directory    | `/`                                    |
   | Site type         | **Static** (or enable **Static site**) |
   | Install command   | `npm ci --include=dev`                 |
   | Build command     | `npm run build`                        |
   | Publish directory | `/dist`                                |
   | Start command     | Leave empty                            |
   | Internal port     | `80`                                   |

   Use Nixpacks with static output; the separate **Static** build pack expects files that are already built. See [Coolify's Vite example](https://coolify.io/docs/applications/framework-examples/javascript/vite) and [Nixpacks deployment guide](https://coolify.io/docs/applications/builds/nixpacks/deploy).

4. Add `NIXPACKS_NODE_VERSION=22` under environment variables and enable **Available during build**. Check the build log resolves Node.js **22.12 or newer**. Nixpacks selects a major version, while its package archive determines the patch version; if it resolves an older release, follow [Coolify's Node.js versioning guide](https://coolify.io/docs/applications/builds/nixpacks/node-versioning) to select a newer archive.
5. Set a domain such as `https://ski.example.com`, point its DNS to your Coolify server, save, and click **Deploy**.
6. Open the deployed URL and check that the game loads, artwork appears, and steering works.

## Notes

- Serve the app at the root of a domain or subdomain. Its asset paths currently assume `/`.
- No application secrets, database, or persistent volumes are needed. Settings and records use browser local storage and are separate for each domain.
- Production artwork is already included in the repository; deployment does not need Python or an asset rebuild.
- Coolify serves the build with Nginx. The Vite development and preview commands are for local use.
