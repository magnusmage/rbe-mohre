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

## Steps

```bash
# 1. On the VM, as root: fetch only the deploy folder's entry point
git clone https://github.com/magnusmage/rbe-mohre.git /opt/rbe/src
cd /opt/rbe/src/deploy

# 2. First run creates /etc/rbe/rbe.env from the template and stops
bash deploy.sh

# 3. Fill in every value in /etc/rbe/rbe.env
#    tokens:  python3 -c "import secrets; print(secrets.token_urlsafe(32))"
#    AGENT_TOOL_TOKEN and REVIEWER_TOKEN must differ (enforced at boot)

# 4. Deploy for real (RBE_REF pins the exact tag being deployed)
RBE_REF=stage2-2026-10-14 bash deploy.sh

# 5. TLS, once DNS resolves (touches only this server block)
certbot --nginx -d rbe.magnusmage.com

# 6. Verify from anywhere
bash deploy.sh   # or, from a laptop:
bash smoke_test.sh https://rbe.magnusmage.com
RBE_SMOKE_URL=https://rbe.magnusmage.com python -m pytest tests/smoke -v
```

## ElevenLabs wiring after deploy

In the agent configuration (`agent/`, applied with the Agents CLI):

- tool base URL: `https://rbe.magnusmage.com`
- post-call webhook: `https://rbe.magnusmage.com/webhooks/elevenlabs/post-call`
  with the HMAC secret from `/etc/rbe/rbe.env`

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
