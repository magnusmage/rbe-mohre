# Deployment: rbe.magnusmage.com

One VM, one nginx, several sites: this deployment adds a single scoped
server block and a localhost-only backend service, and touches nothing
else. Every nginx change is gated on `nginx -t`, so a mistake here cannot
take existing domains down.

## Shape

```
Internet
  |
  nginx (existing, shared with other domains)
  |-- other server blocks          unchanged
  |-- rbe.magnusmage.com           deploy/nginx/rbe.magnusmage.com.conf
        |-- /assets, /             static SPA from /opt/rbe/src/web/dist
        |-- /health /docs /openapi.json
        |-- /session /tools /webhooks /review /audit
              -> proxy to uvicorn on 127.0.0.1:8000 (never public directly)
                   systemd unit: rbe.service, user rbe
                   secrets: /etc/rbe/rbe.env (root:rbe 640)
                   data:    /var/lib/rbe/rbe.db (only writable path)
```

The SPA is built with `VITE_API_BASE_URL=https://rbe.magnusmage.com`, so
browser and API share one origin and the control plane needs no CORS.

## Prerequisites on the VM

- nginx with `sites-available` / `sites-enabled` layout, already serving
  the other domain(s)
- git, Node.js 20+ with npm, python3.11+ (`python3.12` preferred)
- port 8000 free on localhost (`ss -ltn | grep 8000` must be empty; if it
  is taken, change the port consistently in `systemd/rbe.service` and the
  nginx conf before deploying)
- DNS: an A record `rbe.magnusmage.com` -> the VM's public IP
- certbot with the nginx plugin, for TLS

## Pre-flight: check before you change anything

`preflight.sh` is strictly read-only (no installs, no writes, no reloads)
and prints PASS / WARN / FAIL for every item below. `deploy.sh` runs it
automatically and aborts on any FAIL before touching the system; run it
alone first to see where the VM stands.

| # | Check | Why it protects what is already running |
|---|---|---|
| 1 | Tooling: git, nginx, node >= 20, npm, python3.11+, certbot | fail early instead of half-deploying |
| 2 | nginx running and `nginx -t` passes TODAY | a broken baseline must be fixed first, not built on |
| 3 | `sites-available` / `sites-enabled` layout exists | deploy.sh writes only there; other layouts stop the deploy |
| 4 | `rbe.magnusmage.com` not claimed by another nginx file | never fight an existing site over a server_name |
| 5 | Port 8000 free on localhost (or held by a previous rbe.service) | never bind over another app; redeploys recognised |
| 6 | `/opt/rbe`, `/etc/rbe`, `/var/lib/rbe` free or from a previous RBE deploy | never adopt a directory that belongs to something else |
| 7 | No foreign `rbe.service` unit | never overwrite someone else's service |
| 8 | 2 GB free on /opt | venv + node_modules + build headroom |
| 9 | DNS resolves (WARN only) | deploy works without it; certbot does not |

```bash
RBE_HOST=rbe.magnusmage.com bash preflight.sh
```

## Steps

```bash
# 0. Snapshot or note the VM state if the provider offers it (optional
#    but cheap insurance one hour before going live).

# 1. On the VM, as root: fetch the repo
git clone https://github.com/magnusmage/rbe-mohre.git /opt/rbe/src
cd /opt/rbe/src/deploy

# 2. Read-only pre-flight; fix every FAIL before continuing
bash preflight.sh

# 3. First deploy run creates /etc/rbe/rbe.env from the template and stops
bash deploy.sh

# 4. Fill in every value in /etc/rbe/rbe.env
#    tokens:  python3 -c "import secrets; print(secrets.token_urlsafe(32))"
#    AGENT_TOOL_TOKEN and REVIEWER_TOKEN must differ (enforced at boot)

# 5. Deploy for real (RBE_REF pins the exact tag being deployed)
RBE_REF=stage2-2026-10-14 bash deploy.sh

# 6. TLS, once DNS resolves (touches only this server block)
certbot --nginx -d rbe.magnusmage.com

# 7. Verify from anywhere (SMOKE_INSECURE=1 only before certbot has run)
bash smoke_test.sh https://rbe.magnusmage.com
RBE_SMOKE_URL=https://rbe.magnusmage.com python -m pytest tests/smoke -v
```

## ElevenLabs wiring after deploy

In the agent configuration (`agent/`, applied with the Agents CLI):

- tool base URL: `https://rbe.magnusmage.com`
- post-call webhook: `https://rbe.magnusmage.com/webhooks/elevenlabs/post-call`
  with the HMAC secret from `/etc/rbe/rbe.env`

## Standalone by construction

Everything this deployment owns lives behind four names, and nothing else
is written anywhere:

| Owned | Path |
|---|---|
| Source + build | `/opt/rbe/` |
| Secrets | `/etc/rbe/rbe.env` |
| Data | `/var/lib/rbe/` |
| Service | `/etc/systemd/system/rbe.service` |
| nginx | `/etc/nginx/sites-{available,enabled}/rbe.magnusmage.com.conf` |
| System user | `rbe` (nologin) |

Full removal, leaving the VM exactly as found:

```bash
systemctl disable --now rbe
rm /etc/systemd/system/rbe.service && systemctl daemon-reload
rm /etc/nginx/sites-enabled/rbe.magnusmage.com.conf \
   /etc/nginx/sites-available/rbe.magnusmage.com.conf
nginx -t && systemctl reload nginx
rm -rf /opt/rbe /var/lib/rbe /etc/rbe
userdel rbe
```

## Managing nginx yourself

If you keep your own nginx config for the domain, run every deploy with
`SKIP_NGINX=1 bash deploy.sh`: the script then never writes, links or
reloads anything under `/etc/nginx`, and refuses (without it) to overwrite
a site file it did not write. Your config must do what the reference file
does: serve `/opt/rbe/src/web/dist` with the SPA fallback and proxy
`/health /docs /openapi.json /session /tools /webhooks /review /audit`
to `127.0.0.1:8000`. After each deploy the new SPA build appears at the
same path, so a plain `nginx -t && systemctl reload nginx` is all yours.

## Why other domains stay safe

- The nginx site is a new file in `sites-available`, scoped by
  `server_name rbe.magnusmage.com`, with no `default_server` and no edits
  to `nginx.conf` or any other site file.
- `deploy.sh` refuses to reload nginx unless `nginx -t` passes; a broken
  config leaves the running nginx (and every other site) untouched.
- uvicorn binds 127.0.0.1 only; the only new public surface is the one
  server block.
- `certbot --nginx -d rbe.magnusmage.com` modifies only the matching
  server block.

## Operations

| Task | Command |
|---|---|
| Service status / logs | `systemctl status rbe` / `journalctl -u rbe -f` |
| Deploy a new tag | `RBE_REF=<tag> bash /opt/rbe/src/deploy/deploy.sh` |
| Roll back | same command with the previous tag |
| Backup data | copy `/var/lib/rbe/rbe.db` (sqlite; service may keep running) |
| Rotate a token | edit `/etc/rbe/rbe.env`, then `systemctl restart rbe` |
| Remove the site | `rm /etc/nginx/sites-enabled/rbe.magnusmage.com.conf && nginx -t && systemctl reload nginx` |

## Test cases

Three layers, from repo to production:

1. Repo suites (CI on every PR): `python -m unittest -v`, `pytest`
   (edge, property), `ruff`, and the web build (`npm run build`, strict
   TypeScript).
2. `deploy/smoke_test.sh <url>`: read-only contract check of a deployed
   instance: health + synthetic marker, docs, fail-closed 401s for tools,
   reviewer and webhook without credentials, SPA shell and fallback
   routing. `--api-only` skips the SPA checks for the bare backend.
   `deploy.sh` runs it automatically against localhost on every deploy.
3. `tests/smoke/test_deployed.py`: the same contract as pytest cases,
   gated behind `RBE_SMOKE_URL`, so it never runs in local or CI suites by
   accident.
