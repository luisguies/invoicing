# Invoicing Application

Full-stack invoicing platform for OCR-based load ingestion, load lifecycle management, weekly invoice generation, and old-invoice import workflows.

## Current Architecture

- **Nginx** (`invoicing-nginx`): reverse proxy on `http://localhost`
- **Node.js app** (`invoicing-nodejs`): React frontend (`:3000`) + Express API (`:5000`)
- **Python OCR service** (`invoicing-python`): OCR/extraction service on `:8000`
- **MongoDB** (`invoicing-mongodb`): primary data store

Nginx routes:
- `/` -> React app
- `/api` -> Express API

## Core Features

- Password-protected web app (session-based auth)
- PDF upload -> OCR extraction -> load creation
- Carrier and driver management with alias support
- Conflict detection:
  - Date conflicts
  - Driver overlap conflicts (informational)
  - Duplicate load-number conflicts per carrier (informational)
- Invoicing workflow:
  - Generate invoices from selected loads or invoice rules
  - Auto-group by **carrier + invoice week**
  - Mark loads as invoiced/uninvoiced
- Old invoice workflows:
  - Upload historical invoice PDFs
  - Extract old invoice structured data
  - Save extracted old invoices into loads + invoice records
- Reporting pages:
  - Invoiced load search
  - Company load log
  - Sub-dispatcher report

## Prerequisites

- Docker Desktop
- Docker Compose
- Google Gemini API key
- Google Cloud Vision credentials

## Environment Variables

Create a root `.env` file (there is currently no `.env.example` in this repo):

```env
GEMINI_API_KEY=your_gemini_key
GOOGLE_APPLICATION_CREDENTIALS=/app/keys/your-service-account.json
LOGIN_PASSWORD=your_app_password

# Optional
REACT_APP_API_URL=/api
```

Required for normal usage:
- `GEMINI_API_KEY`
- `GOOGLE_APPLICATION_CREDENTIALS`
- `LOGIN_PASSWORD`

## Run With Docker

```bash
docker-compose up --build
```

Main URLs:
- App (recommended): `http://localhost`
- Frontend direct: `http://localhost:3000`
- Backend health: `http://localhost:5000/api/health`
- Python OCR service: `http://localhost:8000`

## App Navigation (Current)

- Upload
- Loads
- Create Load
- Invoices
- Upload Old Invoices
- Invoiced Loads
- Calendar
- Company Load Log
- Sub-dispatcher Report
- Load Invoice Creator
- Settings

## API Overview

All endpoints are under `/api`.  
Only `/api/auth/*` and `/api/health` are public; all other routes require an authenticated session.

- **Auth**: `/api/auth/login`, `/api/auth/logout`, `/api/auth/check`
- **Upload**: `/api/upload`
- **Loads**: `/api/loads`, `/api/loads/grouped`, `/api/loads/invoiced`, `/api/loads/log`, `/api/loads/sub-dispatcher-report`, and load mutation endpoints
- **Carriers**: `/api/carriers`
- **Drivers**: `/api/drivers`
- **Rules**: `/api/rules`
- **Invoices**: `/api/invoices`, `/api/invoices/generate`, `/api/invoices/upload-old`, `/api/invoices/extract-old-invoice`, `/api/invoices/save-extracted`
- **Dispatchers**: `/api/dispatchers`
- **Settings**: `/api/settings`

See `API_REFERENCE.md` for full route-level details.

## Persistence and Storage

- Mongo data: `./mongodb-data`
- Uploaded PDFs: `./uploads`
- Generated invoices and imported old invoice files: `./invoices`, `./uploads/old-invoices`

## Common Commands

```bash
docker-compose ps
docker-compose logs -f
docker-compose logs -f nodejs-app
docker-compose logs -f python-scripts
docker-compose logs -f mongodb
docker-compose down
```

## License

ISC
