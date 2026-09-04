# Security

## Threat model

Crayon runs on your machine, during development only. It starts your dev server, proxies it on `127.0.0.1`, and writes to files inside the project directory. It has no network access beyond localhost, no account, no telemetry.

Things worth knowing:

- The proxy listens on `127.0.0.1` only. Other machines on your network cannot reach the Crayon window.
- The writer refuses paths outside the project root, so a crafted `data-crayon` value cannot make it write elsewhere.
- The overlay is injected only into responses served through the Crayon proxy. Your `npm run dev` and production builds never include it.
- The build plugin is a no-op unless `CRAYON=1` is set in the dev server's environment.

## Reporting a vulnerability

Email dom@fabriquestudio.fr with a description and, if possible, a repro. Please do not open a public issue for security problems. You will get an answer within a few days, and a fix or a mitigation before any public disclosure.
