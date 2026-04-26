# HTTPS Rollout for VM Deployment

This runbook publishes the app behind TLS on `80/443` with automatic certificates via Caddy.

## 1) DNS and host prerequisites

1. Pick a hostname (example: `app.dystoppia.com`).
2. Create an `A` record to the VM public IP (`20.14.148.143`).
3. Wait for DNS propagation before starting Caddy.

## 2) Prepare environment

In VM deploy env (`.env.vm`), set:

```env
APP_HOST=app.dystoppia.com
NEXT_PUBLIC_APP_URL=https://app.dystoppia.com
```

## 3) Publish through `docker-compose.vm.yml`

Use the VM compose stack that already includes:
- `app` service (Next.js on `8080`)
- `caddy` service (reverse proxy + automatic TLS)

`Caddyfile` expects `{$APP_HOST}` and proxies traffic to `app:8080`.

## 4) Open inbound NSG rules

Keep only required ports:
- Allow `80/tcp` (HTTP challenge + redirect)
- Allow `443/tcp` (HTTPS)
- Remove public `3000/tcp` once HTTPS is verified

## 5) Deploy and verify

1. Deploy with VM script (`scripts/deploy-vm.ps1`) using `.env.vm`.
2. Confirm containers are healthy:
   - `docker compose --env-file .env.vm -f docker-compose.vm.yml ps`
3. Validate:
   - `https://app.dystoppia.com/api/health` returns `200`
   - browser shows valid certificate
   - HTTP redirects to HTTPS

## 6) Hardening checklist

- Set `DISABLE_AUTH=0` (or unset) in production env.
- Ensure real `COOKIE_SECRET`, LLM keys, and billing secrets are configured.
- Restrict `3000` in NSG after TLS cutover.
- Keep app logs monitored for `generate-questions` errors after cutover.
