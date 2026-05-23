# MultiDrive — Interview Preparation Master Document

---

## 1. Project Overview (30-second pitch)

**MultiDrive** is a distributed file storage system that splits large files into encrypted 8 MB chunks and distributes them across multiple linked Google Drive accounts. It has a REST API backend, a React frontend, a CLI tool, and an async worker queue — all built with TypeScript on Node.js.

**Why does this project exist?**  
Google Drive gives every account 15 GB free. If you have 5 accounts, that's 75 GB. MultiDrive pools those accounts so you can use them as a single, larger storage backend — transparently, with encryption and integrity checks.

---

## 2. System Architecture

```
┌────────────┐     HTTP/REST      ┌──────────────────────────────────────┐
│  React UI  │ ◄────────────────► │          Fastify API Server           │
│  (Vite)    │                    │  /auth  /files  /accounts  /admin     │
└────────────┘                    └──────────┬─────────────────┬──────────┘
                                             │                 │
┌────────────┐     HTTP/REST                 │           ┌─────▼──────┐
│    CLI     │ ◄─────────────────────────────┘           │ PostgreSQL │
│  (yargs)   │                                           │  (Prisma)  │
└────────────┘                                           └────────────┘
                                                               │
                                             ┌─────────────────▼──────────┐
                                             │           Redis              │
                                             │  Queue | Cache | OAuth State │
                                             └─────────────┬───────────────┘
                                                           │
                                             ┌─────────────▼───────────────┐
                                             │       BullMQ Worker          │
                                             │  Encrypt → Upload to Drive   │
                                             └─────────────────────────────┘
```

### Request Flow — File Upload
1. Client sends `POST /files/upload` with multipart form-data
2. Server streams the file through the chunker (8 MB pieces, SHA-256 per chunk)
3. Each chunk path is enqueued as a BullMQ job
4. Server responds `202 Accepted` immediately with `fileId`
5. Worker picks up each job, encrypts the chunk (AES-256-GCM), uploads to Drive
6. Worker marks each chunk `COMPLETE`; when all complete, file becomes `COMMITTED`
7. Client polls `GET /files/:id/status` until committed

### Request Flow — File Download
1. Client sends `GET /files/:id/download`
2. Server fetches chunk manifest (ordered list of driveFileId + accountId)
3. For each chunk: check Redis cache → if miss, download from Drive → decrypt → verify SHA-256
4. Stream decrypted chunks directly to client response

---

## 3. Tech Stack & Why Each Choice Was Made

### Node.js + TypeScript
**Why Node.js?**  
- Event-driven, non-blocking I/O is ideal for a file upload/download service where most time is spent waiting on network (Google Drive API calls)
- Massive ecosystem (npm)
- Same language for frontend and backend (code sharing, one mental model)

**Why not Python/Go?**  
- Python's GIL limits concurrency for CPU-heavy tasks; Go would be excellent but requires more boilerplate and has a steeper learning curve for a solo project
- Node's async model fits this use-case naturally

**Why TypeScript?**  
- Catches bugs at compile time (wrong field names, missing null checks)
- Self-documenting — the type for `UploadJobData` tells you exactly what the worker expects
- Refactoring is safe — rename a field and TypeScript shows every break

**Why not plain JavaScript?**  
- Without types, a BigInt/number mismatch in quota handling would only surface at runtime in production

---

### Fastify (API Framework)
**Why Fastify over Express?**  
- ~2x faster throughput (benchmarks: 30k req/s vs 15k req/s for Express) due to its schema-based JSON serializer
- First-class TypeScript support with typed route generics (`app.get<{ Params: { id: string } }>`)
- Plugin system is more structured (register once, isolated scope)
- Built-in JSON schema validation, request logging

**Why not NestJS?**  
- NestJS adds a heavy abstraction layer (decorators, modules, DI container) that's great for teams but adds complexity for a solo project
- Fastify gives more control with less magic

**Why not Hapi?**  
- Hapi is excellent but has a smaller ecosystem and slower community velocity

---

### PostgreSQL + Prisma
**Why PostgreSQL?**  
- Relational data model fits perfectly: `User → Account → Chunk → File`
- ACID transactions (chunk upsert + file status update in one transaction)
- `BigInt` support for storage bytes (files can be >2 GB, exceeding 32-bit int)
- Rock-solid, battle-tested

**Why not MongoDB?**  
- No joins — you'd embed chunk arrays in file documents, leading to document bloat for large files with many chunks
- Transactions in MongoDB are possible but more complex
- The data is clearly relational; forcing it into documents adds no benefit

**Why not MySQL?**  
- PostgreSQL has better JSON support, better full-text search, `@unique` on nullable columns is handled more cleanly

**Why Prisma over TypeORM / Knex / Drizzle?**  
- Prisma auto-generates a fully-typed client from the schema — no manual type definitions
- Migration workflow is clear (`prisma migrate dev`)
- `prisma studio` gives a free database GUI
- TypeORM has known issues with complex relationships; Knex is a query builder (more verbose); Drizzle is newer with smaller community

---

### BullMQ + Redis (Queue)
**Why async queue for uploads?**  
- Uploading to Google Drive can take seconds to minutes per chunk
- If done synchronously in the request handler, the HTTP request would timeout for large files
- The queue lets the server respond `202 Accepted` immediately and process in the background
- Retries on failure are built-in

**Why BullMQ over RabbitMQ?**  
- BullMQ runs on Redis, which you already need for OAuth state and chunk cache — one less infrastructure dependency
- Simple JavaScript API, excellent TypeScript types
- Bull Board gives a free web dashboard (`/admin/queues`) with no extra setup

**Why not Kafka?**  
- Kafka is designed for high-throughput event streaming (millions of events/sec)
- It adds significant operational complexity (ZooKeeper/KRaft, consumer groups, partition management)
- BullMQ is a perfect fit for a job queue at this scale

**Why not AWS SQS?**  
- Adds cloud cost and external dependency; Redis is self-hosted and free

**Retry strategy: exponential backoff**  
- Configured `attempts: 3`, `backoff: { type: 'exponential', delay: 1000 }`
- First retry after 1s, second after 2s, third after 4s
- Prevents hammering a temporarily unavailable Drive API

---

### Redis
Used for three distinct purposes:
1. **BullMQ queue backend** — job storage and coordination
2. **Chunk cache** — decrypted chunks cached for 1 hour (TTL) to speed up repeated downloads
3. **OAuth state** — random state tokens stored for 10 minutes to prevent CSRF during OAuth flow

**Why Redis over Memcached?**  
- Redis supports richer data types (sorted sets for queue, strings for cache)
- BullMQ requires Redis (not Memcached)
- Redis has persistence options (AOF/RDB) if needed

---

### Google Drive API (Storage Backend)
**Why Google Drive?**  
- Free tier: 15 GB per account; pooling multiple accounts gives free scalable storage
- Well-documented REST API with resumable uploads
- OAuth 2.0 support is standard

**Why resumable uploads?**  
- Large files (300 MB chunks after encryption) risk timeout on a single PUT
- Resumable upload sessions survive network interruptions — you can resume from the last byte boundary
- The `DRIVE_UPLOAD_PIECE_SIZE` (256 KB) sends data in small pieces within the resumable session

**OAuth Scopes chosen:**
- `drive.file` — only access files created by this app (least privilege)
- `drive.metadata.readonly` — needed for `about.get` to fetch storage quota
- `userinfo.email` + `userinfo.profile` — to identify the user linking the account

**Why not `drive` (full access) scope?**  
- Principle of least privilege — never ask for more than you need
- `drive` scope requires Google's OAuth verification process for published apps

---

### AES-256-GCM Encryption
**Why encrypt chunks before uploading?**  
- Data stored on Google's servers should not be readable by Google or anyone who gains access to the Drive account
- End-to-end: only someone with the encryption key (derived from your server's passphrase) can read the data

**Why AES-256-GCM specifically?**  
- AES-256: 256-bit key, considered unbreakable with current computing
- GCM mode: Galois/Counter Mode — provides both confidentiality AND authentication (detects tampering)
- Alternative: AES-256-CBC — provides confidentiality but no authentication (you'd need a separate HMAC)
- GCM is faster than CBC+HMAC and standard in TLS 1.3

**Key derivation with scrypt (PBKDF):**  
- The encryption key is derived from `ENCRYPTION_PASSPHRASE` + `ENCRYPTION_SALT` using `crypto.scrypt` (100,000 iterations)
- scrypt is memory-hard, making brute-force attacks expensive even with GPUs
- Alternative: PBKDF2 (less memory-hard, easier to GPU-crack), bcrypt (designed for passwords, not key derivation)

**Encrypted blob format:**  
```
[IV (12 bytes)][AuthTag (16 bytes)][Ciphertext (N bytes)]
```
- Random IV per chunk — same plaintext encrypts differently each time
- Auth tag — if even one byte of ciphertext is changed, decryption fails with "authentication failed"

---

### Password Hashing with scrypt
**Why scrypt over bcrypt?**  
- scrypt is memory-hard (requires both CPU and RAM), making parallel GPU attacks much harder
- Built into Node.js `crypto` module — no external dependency
- Alternative: Argon2 (winner of Password Hashing Competition, better than both) but requires native addon

**Why not MD5/SHA-256 for passwords?**  
- These are fast hash functions — an attacker can compute billions of hashes per second
- scrypt is intentionally slow (100,000 iterations) — brute force takes orders of magnitude longer

**Storage format:** `{hex_salt}:{hex_derived_key}`  
- Salt is random per user — two users with the same password have different stored hashes

---

### JWT + HttpOnly Cookies (Auth)
**Two auth flows:**

1. **Username/Password (Frontend):**  
   - Login → server signs JWT → sets as HttpOnly session cookie
   - Browser automatically sends cookie with every request
   - JavaScript cannot read the cookie (XSS protection)

2. **JWT in Authorization header (CLI):**  
   - Token stored in `.env` as `CLI_TOKEN`
   - `@fastify/jwt` checks both cookie and header automatically

**Why HttpOnly cookies over localStorage?**  
- localStorage is accessible to JavaScript → XSS attack can steal the token
- HttpOnly cookie is invisible to JavaScript → XSS cannot steal it
- `sameSite: 'strict'` prevents CSRF — cookie is only sent if the request originates from the same site

**Why JWT over sessions?**  
- Sessions require server-side storage (Redis/DB lookup on every request)
- JWT is stateless — the server verifies the signature without a DB lookup
- Trade-off: JWT cannot be revoked (until expiry). For logout, we just clear the cookie client-side

---

### React + Vite (Frontend)
**Why React?**  
- Component model maps naturally to UI panels (FilesScreen, UploadScreen, DrivesScreen)
- Large ecosystem, well-understood

**Why Vite over Create React App?**  
- Vite uses native ES modules for dev (no bundling) — instant hot reload
- CRA uses Webpack — slower startup, slower rebuilds
- Vite's `proxy` config routes API calls to the backend with one config block

**Why not Next.js?**  
- Next.js adds SSR/SSG which is unnecessary for a private internal tool
- For an API-first app where all data is behind auth, CSR (Client-Side Rendering) is simpler

---

### CLI (yargs)
**Why a CLI alongside a UI?**  
- The UI requires a browser session (HttpOnly cookie)
- The CLI uses a static token (in `.env`) — better for scripting, automation, CI/CD pipelines
- A developer uploading 100 files would script the CLI, not click through a UI 100 times
- CLI and UI hit the **same REST API** — no duplication of logic

**Why yargs over commander.js?**  
- yargs has better built-in help generation and positional argument parsing
- Both are fine choices; yargs was chosen for its ergonomic API

---

## 4. Database Schema Design

```
User
├── id (UUID, PK)
├── email (unique)
├── username (unique, nullable — null for Google-only users)
├── passwordHash (nullable)
└── name

Account (one Google Drive account)
├── id (UUID, PK)
├── userId (FK → User)
├── email (the Google account email, unique)
├── encryptedRefreshToken
├── accessToken
├── tokenExpiresAt
├── quotaTotalBytes (BigInt)
├── quotaUsedBytes (BigInt)
├── uploadedTodayBytes (BigInt)
└── health (Boolean)

File
├── id (UUID, PK)
├── userId (FK → User)
├── sizeBytes (BigInt)
├── mimeType
├── totalChunks
├── sha256Full (hash of entire file for deduplication)
└── status (UPLOADING | COMMITTED | FAILED)

Chunk
├── id (UUID, PK)
├── fileId (FK → File)
├── accountId (FK → Account)
├── sequenceNo
├── sha256 (hash of the raw chunk, for integrity on download)
├── sizeBytes
├── driveFileId
└── status (PENDING | UPLOADING | COMPLETE | FAILED)
```

**Why BigInt for bytes?**  
- 32-bit signed integer max: ~2.1 GB. Files and quotas exceed this.
- 64-bit BigInt max: ~9.2 exabytes. More than enough.

**Why UUID over auto-increment IDs?**  
- UUIDs can be generated client-side or in distributed systems without coordination
- Auto-increment IDs leak information (sequential IDs let competitors count your users)
- UUIDs are safe to expose in URLs

**Deduplication (sha256Full):**  
- Before creating a new file record, the server checks if a `COMMITTED` file with the same `sha256Full` exists
- If yes, return the existing file immediately — no re-upload, no storage cost

---

## 5. Key Engineering Concepts

### Chunking
- Files are split into 8 MB chunks (configurable via `CHUNK_SIZE`)
- Each chunk is individually encrypted and uploaded
- Allows parallelism (4 chunks uploading simultaneously via `WORKER_CONCURRENCY: 4`)
- Allows distribution across multiple Drive accounts
- Allows resumability — if chunk 15 fails, retry only chunk 15

**Why 8 MB?**  
- Google Drive's resumable upload piece size is 256 KB; 8 MB gives 32 pieces per chunk — balanced
- Too small → too many chunks → too much metadata overhead
- Too large → failures are expensive to retry

### Streaming vs Buffering
- The chunker is a Node.js `Transform` stream — data flows through without loading the full file into memory
- A 300 MB upload only uses memory proportional to one chunk (8 MB), not the full 300 MB
- Same for download — chunks are streamed directly to the HTTP response

**Why streaming?**  
- A server handling 10 concurrent 300 MB uploads would need 3 GB of RAM if it buffered — infeasible
- Streaming keeps memory usage flat regardless of file size

### Resumable Uploads to Google Drive
1. `POST` to initiate a session → get a session URI
2. `PUT` chunks of the file to the session URI with `Content-Range` header
3. If interrupted, query the session for the last received byte → resume from there
4. On completion (200/201), get the `driveFileId` and `md5Checksum`
5. Verify md5 locally → confirms no corruption during upload

### OAuth State Parameter (CSRF Prevention)
- Before redirecting to Google, generate a random 32-char hex token
- Store it in Redis with 10-minute TTL
- Include it as `state` parameter in the OAuth URL
- On callback, verify the returned `state` matches the stored one
- Without this, an attacker could trick a user into linking the attacker's Google account

### Token Refresh Strategy
- Access tokens expire in 1 hour
- Before each Drive API call, `getValidAccessToken()` checks `tokenExpiresAt`
- If within 5 minutes of expiry (`TOKEN_REFRESH_BUFFER_MS`), refresh proactively
- Refresh token is stored encrypted (AES-256-GCM) in the database

### Placement Service
- Before enqueueing a chunk upload, `pickAccount()` selects which Google Drive account to use
- Criteria: account must be healthy, have enough free space (`DRIVE_FREE_SPACE_MINIMUM_BYTES: 100 MB`), and not exceed the daily upload cap (`750 GB`)
- This distributes load across accounts and prevents any one account from being overloaded

---

## 6. Security Architecture

| Threat | Mitigation |
|--------|-----------|
| XSS stealing auth token | HttpOnly cookie — JS cannot read it |
| CSRF attacks | `sameSite: strict` cookie + OAuth state parameter |
| Data breach at Google | AES-256-GCM encryption — Google sees ciphertext only |
| Chunk tampering | AES-GCM auth tag + SHA-256 verification on download |
| Brute-force passwords | scrypt (memory-hard, slow by design) |
| Token interception | HTTPS in production; Bearer token only over TLS |
| Replay attacks (OAuth) | State token is single-use (deleted after first use) |
| Weak refresh token storage | Refresh tokens encrypted at rest in DB |

---

## 7. What We Could Have Done Differently

### Alternative: S3-compatible storage instead of Google Drive
- Use MinIO (self-hosted) or AWS S3 instead of Google Drive
- **Pro:** Better API, native multipart upload, no OAuth complexity
- **Con:** Costs money, not "free" pooling — the whole point of this project is using free storage

### Alternative: Kafka instead of BullMQ
- **Pro:** Higher throughput, replay-ability, better for event sourcing
- **Con:** Massive operational overhead; overkill for a file upload queue; requires Zookeeper or KRaft

### Alternative: gRPC instead of REST
- **Pro:** Strongly typed contracts, streaming support, more efficient binary protocol
- **Con:** Browser support is limited (requires grpc-web proxy); REST is simpler and universal

### Alternative: End-to-end encryption (client-side)
- Encrypt in the browser before uploading → even the server never sees plaintext
- **Pro:** True E2E security
- **Con:** Key management becomes the user's problem; cannot search/index file contents; significantly more complex

### Alternative: Argon2 instead of scrypt
- Argon2 won the Password Hashing Competition and is theoretically superior
- **Con:** Requires native Node.js addon (`argon2` npm package with C++ bindings); scrypt is built into Node.js crypto

### Alternative: NestJS instead of Fastify
- NestJS provides better structure for large teams (dependency injection, decorators)
- **Con:** More complexity, slower startup, harder to reason about for a solo project

### Alternative: Prisma + PlanetScale (serverless MySQL)
- Serverless DB that scales automatically
- **Con:** Adds cost; PostgreSQL is free and already self-hosted via Docker

---

## 8. Interview Questions & Model Answers

---

### Architecture & Design

**Q: Walk me through the architecture of MultiDrive.**  
A: *"MultiDrive is a distributed file storage system. At a high level: a Fastify REST API server handles client requests. When a file is uploaded, it's chunked into 8 MB pieces, and each chunk is enqueued as an async job in BullMQ (backed by Redis). A worker process picks up these jobs, encrypts each chunk with AES-256-GCM, and uploads it to one of the user's linked Google Drive accounts. The file record in PostgreSQL tracks the status. For download, the server fetches the chunk manifest, downloads and decrypts each chunk in order, and streams the reassembled file to the client. The system has a React frontend and a CLI — both hit the same REST API."*

**Q: Why did you choose async workers over synchronous uploads?**  
A: *"A 300 MB file split into 38 chunks, each uploaded to Google Drive, would take minutes. If done synchronously, the HTTP request would timeout. With BullMQ, the server responds immediately with a 202 Accepted and a fileId. The client polls for status. This decouples the upload initiation from the actual work, and it gives us retry logic for free — if a chunk fails, BullMQ retries it with exponential backoff."*

**Q: How would you scale this system?**  
A:  
- *Run multiple API server instances behind a load balancer (stateless — JWT auth, no server-side session)*  
- *Scale workers horizontally — each worker is independent and pulls from the same Redis queue*  
- *PostgreSQL read replicas for read-heavy operations (file listing)*  
- *Redis Cluster for higher queue throughput*  
- *Add a CDN layer for frequently downloaded files (cache at edge)*  
- *Rate limiting per user to prevent abuse*

**Q: What are the failure modes of this system?**  
A:  
- *Chunk upload fails → BullMQ retries 3 times with exponential backoff → if all fail, chunk status is FAILED → file status is FAILED → cleanup worker removes orphan chunks from Drive*  
- *Google Drive account goes offline / token expires → `health: false` flag set → placement service skips unhealthy accounts*  
- *Redis goes down → queue stops; API continues serving reads from PostgreSQL; uploads will queue when Redis recovers (BullMQ persists jobs)*  
- *Server crash mid-download → client gets a partial response; must retry; idempotent GET*

---

### Database

**Q: Why did you use BigInt for storage bytes?**  
A: *"A 32-bit signed integer maxes out at about 2.1 GB. Google Drive accounts can have 15 GB or more, and users might store terabytes across accounts. BigInt (64-bit) handles up to ~9.2 exabytes — future-proof."*

**Q: How does deduplication work?**  
A: *"When a file is uploaded, the chunker computes a SHA-256 hash of the entire file. Before creating a new file record, the server checks if a committed file with the same hash already exists. If it does, it returns the existing fileId immediately — no re-upload, no storage cost. This is called content-addressed storage."*

**Q: Why UUIDs instead of auto-increment IDs?**  
A: *"Auto-increment IDs are sequential, which leaks business information (a competitor can tell how many files you have). They also require coordination in distributed systems. UUIDs can be generated anywhere without a central counter. They're also safe to expose in URLs."*

**Q: Explain the Prisma transaction in `markChunkComplete`.**  
A: *"When a chunk finishes uploading, we need to: upsert the chunk record, count completed chunks, and if all are done, update the file status to COMMITTED. These three operations must happen atomically — if the server crashes between the count and the update, the file would be stuck in UPLOADING forever. Prisma's `$transaction` wraps all three in a single DB transaction."*

---

### Security

**Q: Why AES-256-GCM over AES-256-CBC?**  
A: *"GCM (Galois/Counter Mode) provides both encryption and authentication in one pass. The authentication tag means if anyone modifies even a single byte of the ciphertext, decryption fails with an error. CBC only provides confidentiality — you'd need a separate HMAC for tamper detection. GCM is also parallelizable and is the standard in TLS 1.3."*

**Q: What is the OAuth state parameter and why is it important?**  
A: *"It's a random token generated before the OAuth redirect and stored in Redis. When Google redirects back, the state parameter in the URL must match the stored value. Without this, an attacker could send a user a crafted link that links the attacker's Google account to the victim's profile — a CSRF attack. The state makes each OAuth flow unique and un-forgeable."*

**Q: Why store JWT in an HttpOnly cookie rather than localStorage?**  
A: *"localStorage is readable by any JavaScript on the page. If there's an XSS vulnerability anywhere on the site, an attacker's script can read `localStorage` and steal the token. HttpOnly cookies cannot be accessed by JavaScript at all — `document.cookie` won't show them. Combined with `sameSite: strict`, they're also protected against CSRF."*

**Q: How do you protect the refresh token?**  
A: *"The refresh token is encrypted with AES-256-GCM using the same key derivation as chunk encryption, then stored as a base64 string in the database. Even if the database is compromised, the attacker can't use the refresh tokens without the server's `ENCRYPTION_PASSPHRASE`."*

---

### Performance

**Q: How does the chunk cache work?**  
A: *"When a chunk is downloaded from Google Drive and decrypted, the plaintext is stored in Redis with a 1-hour TTL keyed by the chunk's SHA-256 hash. If the same file is downloaded again within that hour, we serve from Redis instead of making Drive API calls. This is significant — a 300 MB file has 38 chunks, each requiring a Drive API call. The cache reduces that to zero on subsequent downloads."*

**Q: Why stream the download response instead of buffering it?**  
A: *"With buffering, downloading a 300 MB file would require 300 MB of RAM per concurrent download. With 10 concurrent downloads, that's 3 GB — you'd need a very large server. Streaming writes each chunk directly to the HTTP response as it's decrypted. Memory usage is proportional to one chunk (8 MB), not the file size. Node.js's async generator makes this clean — `yield decryptedChunk` writes to the response and moves to the next."*

**Q: What is the WORKER_CONCURRENCY setting?**  
A: *"BullMQ workers can process multiple jobs in parallel. With `concurrency: 4`, one worker process handles 4 chunk uploads simultaneously. This is CPU/IO-bound work — 4 concurrent Drive API calls saturates the available network bandwidth without overwhelming the process. You'd tune this based on network capacity and Drive API rate limits."*

---

### Node.js & TypeScript

**Q: Why Node.js for file uploads? Isn't it single-threaded?**  
A: *"Node.js is single-threaded for JavaScript execution, but I/O operations (network requests, file reads) are handled by libuv's thread pool and the OS kernel — they don't block the event loop. A chunk upload spends 99% of its time waiting for the Drive API to respond. During that wait, the event loop handles other requests. This is exactly where Node.js excels. For CPU-intensive work (encryption), Node's crypto module uses native C++ bindings, not the JS event loop."*

**Q: What are async generators and why did you use one for download?**  
A: *"An async generator is a function that `yield`s values asynchronously. In the download handler, `downloadFileChunks` is an `async function*` that `yield`s decrypted Buffer chunks one at a time. The route handler iterates with `for await...of` and writes each chunk to the response. This means we never hold more than one chunk in memory at a time — it's lazy evaluation for async sequences."*

**Q: Explain the TypeScript generic route definition.**  
A: *"`app.get<{ Params: { id: string } }>('/files/:id/status', ...)` — the generic tells TypeScript the shape of `request.params`. Without it, `request.params.id` would be typed as `any` and you'd lose autocomplete and type checking. Fastify uses these generics to type-check handler arguments at compile time."*

---

### Frontend

**Q: How does the Vite proxy work?**  
A: *"In dev mode, the React app runs on port 5173 and the API on port 3000. If the browser made a fetch to `localhost:3000`, it would be a cross-origin request, and cookies wouldn't be sent by default (even with credentials). The Vite proxy intercepts requests to `/auth`, `/files`, `/accounts` and forwards them to `localhost:3000` transparently — from the browser's perspective, everything is on port 5173 (same origin), so cookies work correctly."*

**Q: Why React Context for auth state?**  
A: *"The auth state (current user, session start time) is needed by multiple components: TopBar (shows username), FilesScreen (shows files for this user), UploadScreen. Passing it as props through every level would be 'prop drilling'. React Context provides a global state that any component can subscribe to without intermediate components needing to know about it."*

---

### System Design

**Q: How would you add encryption key rotation?**  
A: *"Currently all chunks are encrypted with the same derived key. For rotation: add a `keyVersion` field to the Chunk table. When rotating, generate a new passphrase+salt, create a background job that re-downloads, re-encrypts, and re-uploads each chunk, then updates `keyVersion`. New uploads use the new key. Old chunks are migrated asynchronously."*

**Q: How would you add file sharing between users?**  
A: *"The schema already has a `Permission` model with `fileId`, `principalId`, and `role (OWNER | EDITOR | VIEWER)`. The download and status endpoints would be updated to check permissions: if `request.user.id` is the owner OR has a permission record for this file, allow access."*

**Q: What happens if a Google Drive account runs out of space?**  
A: *"The placement service checks `DRIVE_FREE_SPACE_MINIMUM_BYTES` (100 MB) before selecting an account. If an account has less than 100 MB free, it won't be selected. The quota is updated after each upload and also on OAuth link. If all accounts are full, `pickAccount()` throws — the upload fails with a meaningful error."*

**Q: How would you implement file versioning?**  
A: *"Add a `version` field and a `parentFileId` (self-referential FK) to the File table. Each new upload of the same filename creates a new File record pointing to the previous version. The list endpoint returns the latest version by default with an option to list history."*

---

## 9. "I Don't Know" Recovery Strategies

**When you don't know an answer:**

1. **Decompose the question:**  
   *"I haven't worked with X directly, but let me reason about it — X seems to be about [core concept]. I'd approach it by..."*

2. **Compare with what you know:**  
   *"I know Y works by [mechanism]. X sounds similar but [key difference]. So I'd expect X to..."*

3. **State your hypothesis and invite correction:**  
   *"My instinct is [answer] because [reasoning]. I'm not 100% certain — is that on the right track?"*

4. **Fall back to first principles:**  
   *"I'd look at the constraints: latency requirements, consistency requirements, scale. Given those, I'd lean toward [choice] because..."*

5. **Be honest + show curiosity:**  
   *"I haven't encountered that specific problem, but I'd research [X] and look at how [known system like Redis/Postgres] handles it."*

---

## 10. Concepts You Must Know (Deep Reference)

### CAP Theorem
- **Consistency** — every read returns the most recent write
- **Availability** — every request gets a response (not necessarily most recent)
- **Partition Tolerance** — system continues despite network splits
- PostgreSQL is CP (consistent + partition-tolerant, may be unavailable during splits)
- Redis (in cluster mode) is AP (available, eventually consistent)

### ACID vs BASE
- PostgreSQL: ACID (Atomicity, Consistency, Isolation, Durability)
- NoSQL systems often BASE (Basically Available, Soft state, Eventually consistent)
- For financial or integrity-critical data, ACID is the right choice

### REST API Design
- **Idempotent:** GET, PUT, DELETE — same result if called multiple times
- **Non-idempotent:** POST — creates a new resource each time
- Use `202 Accepted` (not `200 OK`) when work is deferred to a queue
- Use `409 Conflict` when a resource already exists (username taken)
- Use `401 Unauthorized` when not authenticated; `403 Forbidden` when authenticated but not allowed

### Event Loop (Node.js)
- Single thread executes JavaScript
- libuv handles I/O (file, network) on OS threads / kernel async I/O
- `await fetch(...)` doesn't block the event loop — it registers a callback and the loop moves on
- CPU-heavy work (crypto) should use `worker_threads` or native addons to avoid blocking

### HTTP Status Codes You Must Know
| Code | Meaning | Used in MultiDrive |
|------|---------|-------------------|
| 200 | OK | File list, download |
| 201 | Created | Register, file record |
| 202 | Accepted | Upload initiated |
| 400 | Bad Request | Invalid state parameter |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Valid token, wrong scope |
| 404 | Not Found | File not found |
| 409 | Conflict | Username/email taken |
| 500 | Internal Server Error | Unexpected exceptions |

### Encryption Concepts
- **Symmetric encryption (AES):** same key encrypts and decrypts — fast, used for data
- **Asymmetric encryption (RSA/ECDSA):** public key encrypts, private key decrypts — used for key exchange
- **IV (Initialization Vector):** random value that makes each encryption unique even with the same key and plaintext
- **Auth tag (GCM):** a MAC that proves the ciphertext hasn't been tampered with
- **PBKDF (Password-Based Key Derivation Function):** turns a human password into a cryptographically strong key

---

## 11. Quick Reference — Commands

```bash
# Start everything
docker compose up -d          # PostgreSQL + Redis
npm run dev                   # API server
npm run worker                # Upload worker

# Frontend
cd frontend && npm run dev    # React dev server (port 5173)

# Database
npx prisma studio             # GUI at localhost:5555
npx prisma migrate deploy     # Apply migrations

# CLI usage
export CLI_TOKEN=<token>
npm run cli -- upload /path/to/file.mp4
npm run cli -- download <fileId> output.mp4
npm run cli -- list

# Worker health check
npm run check-worker

# Flush chunk cache
npx tsx scripts/flush-cache.ts

# Bull Board dashboard
open http://localhost:3000/admin/queues
```

---

## 12. One-line Answers for Rapid-fire Rounds

| Question | Answer |
|----------|--------|
| Why Fastify? | 2x faster than Express, typed generics, schema validation |
| Why BullMQ? | Retry logic, visibility, Redis-backed, zero extra infra |
| Why chunks? | Parallelism, resumability, multi-account distribution |
| Why AES-256-GCM? | Encryption + authentication in one, TLS 1.3 standard |
| Why scrypt? | Memory-hard, built into Node, brute-force resistant |
| Why HttpOnly cookie? | XSS-proof — JS cannot read it |
| Why UUID? | No coordination, safe in URLs, no info leakage |
| Why BigInt? | Storage can exceed 32-bit int (>2.1 GB) |
| Why Prisma? | Type-safe client auto-generated from schema |
| Why stream download? | O(1) memory regardless of file size |
| Why 202 for upload? | Work is queued — response is immediate, not complete |
| Why Redis for cache? | O(1) lookup, TTL support, already in the stack |
| Why `sameSite: strict`? | Prevents CSRF — cookie not sent on cross-site requests |
| Why resumable upload? | Survives network interruptions for large files |
