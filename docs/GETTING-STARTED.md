# Getting Started

## Prerequisites

- Node.js 22 is recommended and is the version used by frontend CI.
- npm, supplied with Node.js.
- A running Generic SQL API backend is required for live report and dashboard data. It is not required to run the isolated frontend test suite.

## Install the Repository

```bash
git clone git@github.com:itsshashanksp/Generic_Reporting_Framework.git
cd Generic_Reporting_Framework
npm ci
```

`npm ci` installs the exact dependency versions recorded in `package-lock.json`.

## Configure the API URL

The frontend reads `VITE_API_URL` as the request endpoint. Create a `.env` file in the repository root for live report and dashboard data:

```dotenv
VITE_API_URL=http://localhost:8000
```

Use the URL of your backend deployment and do not commit local environment files or secrets. The checked-in `.env.example` records the supported variable.
For local loopback development, the client automatically aligns `localhost` and `127.0.0.1` with the hostname used to open the frontend. This keeps the session cookie on the same browser site while preserving `SameSite=Lax` protection.

## Start Development

```bash
npm run dev
```

Open the local URL printed by Vite. Reports and dashboards that request data also require the configured backend to be reachable.

## Run the Checks

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

The production output is written to `dist/`. To serve that output locally after a build, run `npm run preview`.

## Next Steps

- Read [Architecture](ARCHITECTURE.md) for the runtime flow.
- Read [SQL / JSON Separation](SQL-JSON-SEPARATION.md) before editing configuration.
- Use [Development](DEVELOPMENT.md) for authoring workflows.

[Documentation index](README.md) · [Project README](../README.md)
