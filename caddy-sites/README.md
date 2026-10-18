# caddy-sites

HMS's Caddy (`hms-caddy`) holds this server's ports 80 and 443, so any other app hosted on the
same server is served through it. Each such app puts **one file** here, `<app>.caddy`, holding its
site block, for example:

```
app.example.com {
	reverse_proxy some-app:3000
}
```

The `Caddyfile` imports every `*.caddy` file in this folder, and `docker-compose.prod.yml` mounts it
read-only. The other app's container must be on the `shared-proxy` Docker network, which Caddy
also joins.

**These files are not committed** (`.gitignore`): they belong to the other apps and to this
particular server, and each app's own deployment notes say what to put here. Resetting or
re-cloning this repository leaves this folder empty -- those apps then need their file put back.

After adding or changing a file, check it before Caddy uses it, then reload without downtime:

```bash
docker exec hms-caddy caddy validate --config /etc/caddy/Caddyfile
docker exec hms-caddy caddy reload --config /etc/caddy/Caddyfile
```
