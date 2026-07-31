# MultiDrive

MultiDrive is a full-stack file storage project that splits uploads into chunks and stores them across linked Google Drive accounts.

## Features

- User registration and login with HttpOnly JWT cookies
- Google Drive OAuth account linking
- Chunked file upload, download, listing, deletion, and status tracking
- BullMQ upload worker backed by Redis
- PostgreSQL metadata storage with Prisma
- SHA-256 deduplication and chunk integrity checks
- AES-256-GCM encryption for chunks uploaded by the worker
- React dashboard and CLI client

## Tech Stack

- Backend: Node.js, TypeScript, Fastify
- Frontend: React, Vite
- Database: PostgreSQL, Prisma
- Queue: Redis, BullMQ
- Storage API: Google Drive
- Tests: Vitest

## Project Structure

```text
src/api/          Fastify server and routes
src/services/     upload, chunking, Google Drive, queue, and crypto logic
src/workers/      background upload workers
src/db/           Prisma and Redis clients
src/cli/          command-line client
prisma/           database schema and migrations
frontend/         React dashboard
scripts/          utility scripts
```

## Requirements

- Node.js
- npm
- Docker
- Google Cloud OAuth credentials for Google Drive access

## Environment

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://multidrive_user:multidrive_pass@localhost:5434/multidrive
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-a-secret
GOOGLE_CLIENT_ID=replace-with-google-client-id
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
ENCRYPTION_PASSPHRASE=replace-with-at-least-16-characters
ENCRYPTION_SALT=0123456789abcdef0123456789abcdef
FRONTEND_URL=http://localhost:5173
```

## Setup

```bash
npm install
cd frontend
npm install
cd ..
docker compose up -d
npx prisma migrate dev
```

## Run

Start the backend:

```bash
npm run dev
```

Start the upload worker in another terminal:

```bash
npm run worker
```

Start the frontend in another terminal:

```bash
cd frontend
npm run dev
```

App URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- Queue dashboard: `http://localhost:3000/admin/queues`

## Scripts

```bash
npm run dev          # start backend API
npm run worker       # start upload worker
npm run cli          # run CLI client
npm test             # run backend tests
```

Frontend scripts:

```bash
cd frontend
npm run dev
npm run build
npm run preview
```

## API Overview

- `GET /health` - health check
- `GET /ready` - database and Redis readiness check
- `POST /auth/register` - create user account
- `POST /auth/login` - log in
- `POST /auth/logout` - log out
- `GET /auth/me` - current user
- `GET /auth/google` - start Google Drive OAuth
- `GET /accounts` - list linked Drive accounts
- `POST /files/upload` - upload file
- `GET /files` - list files
- `GET /files/:id/status` - file upload status
- `GET /files/:id/download` - download file
- `GET /files/:id/chunks` - list file chunks
- `DELETE /files/:id` - delete file record

## Tests

```bash
npm test
```
