# omp-charm

An [Oh My Pi](https://github.com/can1357/oh-my-pi) extension for [Charm Hyper](https://hyper.charm.land).

omp 19.1.1 and later already ship Hyper as the built-in `charm-hyper` provider: models, API-key login, live model discovery and `/usage` credits. This extension does not add a second provider. It changes three things about how the built-in one talks to Hyper, taken from Charm's own [pi-hyper-provider](https://github.com/charmbracelet/pi-hyper-provider):

| Change | What it does |
|---|---|
| Session affinity | Sends `x-session-affinity` and `x-client-request-id` with the session id. Hyper keys provider pinning and upstream prompt caches on it. |
| Compressed requests | Sends JSON request bodies as brotli, falling back to gzip and then plain if Hyper answers 400 or 415. |
| Prism route | Shows `Prism → <model>` in the status line when a Prism model routes the request. |

Measured on one `prism-flash` request from omp 19.1.1: the request body went from 147,183 bytes to 55,484 bytes on the wire. The effect of the affinity header on cache hits has not been measured.

## Install

From a checkout:

```sh
omp plugin link /path/to/omp-charm
```

Then give omp a Hyper API key: run `/login` and pick Charm Hyper, or set `CHARM_HYPER_API_KEY`. Pick a model with `--model charm-hyper/<id>`; `omp models ls charm-hyper` lists them.

## Develop

```sh
bun install
bun run check
```

## Licence

MIT. `src/compression.ts` is adapted from charmbracelet/pi-hyper-provider (MIT).
