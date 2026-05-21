# Deployment Guide

## Production Docker deployment

1. Copy the production env template:

```bash
cp .env.production.example .env.production
```

2. Fill in all secure values, especially `JWT_SECRET`, `DB_PASSWORD`, and TLS certificate paths.

3. Build and start the stack:

```bash
docker compose --env-file .env.production up --build -d
```

4. Verify the services:

```bash
docker compose ps
```

5. If you enabled TLS, open your browser at `https://your-production-domain.com`.

## Persistent storage

- Database data is stored in the `db_data` named volume.
- Uploaded files are stored in the `backend_uploads` named volume mounted at `Back-End/uploads`.
- Nginx logs are stored in the `nginx_logs` named volume.

## HTTPS certificates

Place your SSL certificate files inside `nginx/certs` as:

- `fullchain.pem`
- `privkey.pem`

For local development or self-signed certificates, use `nginx/certs/README.md` for guidance.

## Backup recommendations

- Backup the MySQL data with `docker exec mawby_db mysqldump -u root -p ${DB_NAME} > backup.sql`
- Periodically snapshot the `backend_uploads` volume or sync it to durable storage.
- Keep generated SSL certificates outside version control.
