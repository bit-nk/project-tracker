# Debian slim (glibc) so @node-rs/argon2 uses its prebuilt binary — no native build.
FROM node:22-slim

WORKDIR /app

# Install deps first for layer caching. tsx is a runtime dep, so --omit=dev is
# enough (only typescript/@types are dev-only, not needed at runtime).
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations

ENV NODE_ENV=production
EXPOSE 8080

# Apply migrations, then start the API. If migrations fail, the container exits
# (so a bad deploy is visible) rather than serving against a stale schema.
CMD ["sh", "-c", "npm run migrate && npm run start"]
