# omp-charm

An [Oh My Pi](https://github.com/can1357/oh-my-pi) extension for [Charm Hyper](https://hyper.charm.land).

omp 19.1.1 and later already ship Hyper as the built-in `charm-hyper` provider: models, API-key login, live model discovery and `/usage` credits. This extension does not add a second provider. It changes three things about how the built-in one talks to Hyper, taken from Charm's own [pi-hyper-provider](https://github.com/charmbracelet/pi-hyper-provider):

| Change | What it does |
|---|---|
| Session affinity | Sends `x-session-affinity` and `x-client-request-id` with the session id, as Charm's own provider does. Keeps one session on one upstream provider; measured cache hits below do not depend on it. |
| Compressed requests | Sends JSON request bodies as brotli, falling back to gzip and then plain if Hyper answers 400 or 415. |
| Prism route | Shows `Prism → <model>` in the status line when a Prism model routes the request. |

Measured on omp 19.1.1 through the installed tag, one `prism-flash` request each: a 938,754-byte request body (system prompt and tool schemas) went out as 183,053 bytes of brotli q4 — 5.1× smaller. A 37,957-byte 13k-token JSON body went to 2,414 bytes (15.7×); the ratio follows how repetitive the body is.

Cache hits did not follow the affinity header. Hyper's prompt cache is keyed on prompt content: a fresh 16,785-token prompt reported 0 cached tokens, and every identical repeat reported 16,384 (97.6%) cached — with the same session id, with no affinity headers at all, and with a different session id. The same held on `glm-5.3` (6,656 of 6,798 tokens cached on every repeat). The header stays because Charm's own provider sends it for provider pinning; it is not what buys the cache hit.

## Install

```sh
omp plugin install 'git+https://github.com/ericjuta/omp-charm.git#v0.1.0'
```

Or from a checkout: `omp plugin link /path/to/omp-charm`.

Then give omp a Hyper API key: run `/login` and pick Charm Hyper, or set `CHARM_HYPER_API_KEY`. Pick a model with `--model charm-hyper/<id>`; `omp models ls charm-hyper` lists them.

## Develop

```sh
bun install
bun run check
```

## Licence

MIT. `src/compression.ts` is adapted from charmbracelet/pi-hyper-provider (MIT, Copyright (c) Charmbracelet, Inc.).
