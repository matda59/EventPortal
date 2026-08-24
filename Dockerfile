# ── Stage 1: build native dependencies ────────────────────────────────────────
# better-sqlite3 compiles from source, needs build tools.
# We compile here and carry only the compiled output to the final image.
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install

# ── Stage 2: production image ──────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Copy compiled node_modules from builder (no build tools in final image)
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY . .

# /app/data is where the SQLite database lives — mount a volume here on Unraid
# /app/public/images — mount a volume here for persistent uploaded images
# /app/public/music  — mount a volume here for persistent music files
VOLUME ["/app/data", "/app/public/images", "/app/public/music"]

EXPOSE 3000

# Seed the database on first boot if it hasn't been seeded yet, then start.
CMD ["sh", "-c", "node api/seed.js && node api/server.js"]
