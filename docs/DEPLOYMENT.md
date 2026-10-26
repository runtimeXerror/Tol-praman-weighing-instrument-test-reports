# Deployment

## Development (one machine, no MongoDB install)

Requirements: Node.js ≥ 20.9, about 2 GB free disk space (the embedded MongoDB stops when the disk is full).

```bash
npm install
npm run seed -- --reset      # demo lab, users, weights, cases, signed reports
npm run dev                  # backend :4000 + frontend :3000 in one terminal
```

Or in two terminals:

```bash
cd backend  && npm run dev   # API :4000; starts the embedded MongoDB on :27027 (data in backend/storage/mongo)
cd frontend && npm run dev   # web :3000; /api/* is forwarded to BACKEND_URL (frontend/.env.local)
```

`GET /api/health` returns `{ ok, db }`; it answers 503 when the database is down.

## Production (Docker Compose)

```bash
JWT_SECRET=<long random> JWT_REFRESH_SECRET=<long random> PUBLIC_WEB_URL=https://reports.example.gov.in \
  docker compose up -d --build
```

| Service | Image | Port | Data |
|---|---|---|---|
| `mongo` | mongo:7 | internal | volume `mongo-data` |
| `backend` | built from `backend/Dockerfile` (Node + Chromium for PDF) | internal 4000 | volumes `files` (attachments, PDF, DOCX) and `keys` (lab signing key) |
| `frontend` | built from `frontend/Dockerfile` (Next.js standalone) | 3000 | none |

Only the frontend is published. The browser calls `/api/*` on the same origin and Next.js forwards it to
the backend, so there is no CORS setup. Put a TLS reverse proxy (nginx, Caddy, or the department's
gateway) in front of port 3000.

### Backend environment

| Variable | Meaning |
|---|---|
| `MONGO_URI` | MongoDB connection string. Empty = embedded MongoDB (development only). |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Token signing secrets. Must be changed. |
| `ACCESS_TTL`, `REFRESH_TTL` | Token lifetimes (default 15m, 7d). |
| `PUBLIC_WEB_URL` | Base URL printed in the QR code. |
| `CORS_ORIGINS` | Allowed browser origins (only needed without the rewrite). |
| `STORAGE_DIR` | Attachments and report files. |
| `KEYS_DIR` | Lab Ed25519 key (`lab-ed25519.pem`), created on first start. |

### Things that must be kept

- **The `keys` volume.** Reports are verified against the lab's current key. If the key is lost, every
  report signed before stops verifying. Back it up with the database.
- **Database and files together**: report hashes in MongoDB must match the PDF files.

### Backup

```bash
docker compose exec mongo mongodump --archive > tolpraman-$(date +%F).archive
docker run --rm -v tolpraman_files:/f -v tolpraman_keys:/k -v "$PWD":/b alpine tar czf /b/files-keys-$(date +%F).tgz /f /k
```

Volume names carry the Compose project prefix (`tolpraman_` when the folder is named `tolpraman`); check
with `docker volume ls`.

### Files in object storage

Files are on a local volume today. MinIO (S3-compatible) is the planned production store and is not yet
in `docker-compose.yml`.
