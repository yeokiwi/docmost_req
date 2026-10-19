<div align="center">
    <h1><b>Docmost</b></h1>
    <p>
        Open-source collaborative wiki and documentation software.
        <br />
        <a href="https://docmost.com"><strong>Website</strong></a> | 
        <a href="https://docmost.com/docs"><strong>Documentation</strong></a> |
        <a href="https://twitter.com/DocmostHQ"><strong>Twitter / X</strong></a>
    </p>
</div>
<br />

## Getting started

This repository contains a customised build of Docmost that adds **requirements management** (see [Requirements](#requirements)). The published `docmost/docmost` Docker image does **not** include these changes, so install it from this repository using one of the methods below.

For general Docmost documentation, see the [official docs](https://docmost.com/docs).

## Installation

### Option A: Docker Compose (recommended)

Requirements: Docker with the Compose plugin, and outbound access to the npm registry while the image builds.

The `Dockerfile` adds the DSO root CAs (`DSOCA10.crt`, `DSOCA20.crt`) to the image's trust store, so the build also needs access to `https://mirror.project.dso`. The Docker daemon itself must already trust that host's certificate, because it downloads the CA files before the image trusts them.

1. Clone this repository and change into it.

2. Edit `docker-compose.yml`. It is already set to build the `docmost` service from this repository (`build: .`), so you only need to set the secrets:
   - `APP_SECRET` is read from a `.env` file next to `docker-compose.yml`, which git ignores. Create it with a random value of at least 32 characters:
     ```bash
     echo "APP_SECRET=$(openssl rand -hex 32)" >> .env
     ```
     Without it, `docker compose` stops with an error. With a short or placeholder secret, the server exits at startup and the page at port 3000 never loads.
   - Replace `STRONG_DB_PASSWORD` with a real password. It appears twice: in `DATABASE_URL` and in `POSTGRES_PASSWORD`.
   - Set `APP_URL` to the address users will open, for example `https://wiki.example.com`.

3. Build and start:
   ```bash
   docker compose up -d --build
   ```
   The first build takes several minutes. Database migrations, including the requirements tables, run automatically when the server starts.

4. Open `APP_URL` (by default http://localhost:3000) and create the first workspace and admin account.

### Option B: From source

Requirements:

| Component | Version |
| --- | --- |
| Node.js | 24 or newer |
| pnpm | 11.28.2 (`corepack enable`, or `npm install -g pnpm@11.28.2`) |
| PostgreSQL | 16 or newer (tested with 18) |
| Redis | 7 or newer (tested with 8) |

The database user must be allowed to create the `unaccent` and `pg_trgm` extensions. The migrations create them.

1. Install dependencies:
   ```bash
   pnpm install --frozen-lockfile
   ```

2. Configure the environment:
   ```bash
   cp .env.example .env
   ```
   Set at least `APP_URL`, `APP_SECRET`, `DATABASE_URL` and `REDIS_URL`. `MAIL_DRIVER` must be `smtp` or `postmark`; configure SMTP if you want invitation and notification emails. See `.env.example` for all options.

3. Build and start:
   ```bash
   pnpm build
   pnpm start
   ```
   `pnpm start` runs in production mode, applies database migrations automatically, and serves both the API and the web app on `PORT` (default 3000).

To keep it running, use a process manager such as systemd or pm2. In production, put a reverse proxy (nginx, Caddy, Traefik) in front for HTTPS. The proxy must forward WebSocket connections on `/collab` and `/socket.io`.

### Development mode

```bash
pnpm install --frozen-lockfile
cp .env.example .env                      # then edit as above
pnpm --filter server migration:latest     # dev mode does not migrate automatically
pnpm dev
```

The web app runs at http://localhost:5173 and proxies API calls to the server at `APP_URL`.

To run the tests for the requirements feature:

```bash
pnpm --filter server test -- requirement
pnpm --filter client exec vitest run src/features/requirement
```

### Upgrading

- **Docker:** pull the latest code, then run `docker compose up -d --build`.
- **From source:** pull the latest code, then run `pnpm install --frozen-lockfile && pnpm build`, then restart `pnpm start`.

In both cases, migrations run on startup.

### Troubleshooting

- **The server exits with an environment validation error.** Check the named variable. `MAIL_DRIVER` must be `smtp` or `postmark`, and `APP_SECRET` must be at least 32 characters.
- **A migration fails with "permission denied to create extension".** Connect as a role that can create extensions, or have a database administrator run `CREATE EXTENSION unaccent; CREATE EXTENSION pg_trgm;` once.
- **`pnpm install` times out downloading one package** (seen with `domhandler-5.0.3.tgz` on some networks). Fetch that package from a mirror into the pnpm store, then install again:
  ```bash
  pnpm store add domhandler@5.0.3 --registry=https://registry.npmmirror.com/
  pnpm install --frozen-lockfile
  ```
  pnpm checks the package against the integrity hash in `pnpm-lock.yaml`, so a tampered copy is rejected. Use a mirror only if your organisation's policy allows it.
- **Double-clicking a draw.io diagram shows a blank editor.** Diagrams use a self-hosted draw.io (the `drawio` service in `docker-compose.yml`, port 8080), and the browser must be able to open the address in `DRAWIO_URL` (default `http://localhost:8080`). If that address uses `localhost` or `127.0.0.1` and the wiki is opened from another computer, the browser automatically uses the host name from the wiki's own address instead (for example `http://192.168.1.225:8080`), so only the port needs to be reachable. If users reach the wiki by another host name, set `DRAWIO_URL=http://<that-host>:8080` in `.env` and run `docker compose up -d`. `DRAWIO_URL` must be an address the browser can open, not a Docker-internal name. In a network with no access to Docker Hub, mirror `jgraph/drawio` to your registry and set `DRAWIO_IMAGE=<registry>/jgraph/drawio:<tag>`. After 15 seconds without a response the editor shows a message naming the URL it tried.
- **Docker builds and `domhandler-5.0.3.tgz`.** The `Dockerfile` pre-fetches this one package from `https://registry.npmmirror.com/`, so the build works even where a proxy refuses it on `registry.npmjs.org`. To use a different mirror, pass the build argument `DOMHANDLER_REGISTRY`, e.g. `docker compose build --build-arg DOMHANDLER_REGISTRY=https://<your-npm-mirror>/`.
- **`docker compose up --build` fails with `ERR_PNPM_FETCH_401 ... Access Denied`** (or keeps timing out) on another package from `registry.npmjs.org`. A proxy is refusing that download. Build against your organisation's internal npm mirror instead:
  ```bash
  NPM_REGISTRY=https://<your-npm-mirror>/ docker compose up -d --build
  ```
  Alternatively, put `NPM_REGISTRY=...` in a `.env` file next to `docker-compose.yml`. The `Dockerfile` passes the value to both npm and pnpm. Lockfile integrity checks still apply, so the mirror must serve the same package files.

## Requirements

Requirements management works like Requirement Yogi for Confluence: requirements are defined inside pages, given unique keys, and can be referenced, reported on, traced and baselined.

**Set up a space.** Open *Space settings → Requirements*. Set a key prefix such as `SYS`; keys are then assigned automatically as `SYS-001`, `SYS-002` and so on. Optionally define standard properties, such as a *Priority* pick-list. Only space admins can change these settings. The prefix cannot be changed after the first key is assigned.

**In the editor**, type `/` and choose:

| Command | What it does |
| --- | --- |
| **Requirement** | Inserts a requirement block with the next key, a title, properties and a description. |
| **Requirement reference** | Inserts a reference to an existing requirement. A reference placed inside another requirement records a dependency; one placed anywhere else counts as page coverage. |
| **Requirements report** | Inserts a live table of requirements, filtered by text, key prefix, properties or coverage. |

**Requirements page.** The *Requirements* item in the space sidebar opens a page with three tabs:

- **Requirements:** a searchable, filterable list, with import from Excel/CSV and export to Excel/CSV.
- **Traceability:** a matrix showing which requirements reference which.
- **Baselines:** frozen snapshots of all requirements. Baselines can be compared with each other or with the current state, and exported.

**Duplicate keys.** Copying a requirement block copies its key. The original keeps the key, and the copy is flagged with a red badge and an *Assign a new key* button. The warning can take up to a minute to appear, because it waits for the page to be saved and indexed.

**Importing.** The first row of the file must be headers, including a *Title* column. *Key* and *Description* columns are optional, and any other column becomes a property. A key is kept only if it uses the space's prefix and is not already in use; otherwise a new key is assigned. Each import creates a new page.

## Features

- Real-time collaboration
- Diagrams (Draw.io, Excalidraw and Mermaid)
- Spaces
- Permissions management
- Groups
- Comments
- Page history
- Search
- File attachments
- Embeds (Airtable, Loom, Miro and more)
- Translations (10+ languages)
- Requirements management (keys, references, reports, traceability, baselines, Excel import/export)

### Screenshots

<p align="center">
<img alt="home" src="https://docmost.com/screenshots/home.png" width="70%">
<img alt="editor" src="https://docmost.com/screenshots/editor.png" width="70%">
</p>

### License
This distribution is licensed under the open-source AGPL 3.0 license (see `LICENSE`).

The Docmost Enterprise Edition code (`apps/client/src/ee`, `apps/server/src/ee`,
`packages/ee`) has been removed. Features that were enterprise-only are either
unavailable or re-implemented here as new AGPL-licensed code (currently: DOCX and
PDF import). The list of open-source features is kept in
`apps/server/src/common/open-source-features.ts`.

### Contributing

See the [development documentation](https://docmost.com/docs/self-hosting/development)

## Thanks
Special thanks to;

<img width="100" alt="Crowdin" src="https://github.com/user-attachments/assets/a6c3d352-e41b-448d-b6cd-3fbca3109f07" />

[Crowdin](https://crowdin.com/) for providing access to their localization platform.


<img width="48" alt="Algolia-mark-square-white" src="https://github.com/user-attachments/assets/6ccad04a-9589-4965-b6a1-d5cb1f4f9e94" />

[Algolia](https://www.algolia.com/) for providing full-text search to the docs.

