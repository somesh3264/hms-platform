# Production image for the Next.js app (go-live plan, Phase 02). Postgres and
# the Caddy reverse proxy are separate containers -- see docker-compose.prod.yml.
#
# Three stages: install real dependencies once, build once, then assemble a
# runtime image that only carries what `node server.js` actually needs
# (Next's `output: 'standalone'` in next.config.js is what makes that last
# part possible -- see the comment there).

FROM node:20-alpine AS base

# ---------- deps ----------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- builder ----------
FROM base AS builder
WORKDIR /app
# Must be installed here too, not just in the runner stage below: `prisma
# generate` detects the OpenSSL version present *at generate time* to pick
# the right query-engine binary. Skip this and it silently falls back to a
# generic target that doesn't match what the runner stage actually has,
# producing a binary the runtime can't load at all.
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generates the Prisma Client (and its query-engine binary) against *this*
# Alpine/musl environment -- must happen in a stage that matches the
# runner's OS, or the engine binary silently won't run there.
RUN npx prisma generate
RUN npm run build

# ---------- runner ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Prisma's query engine needs a real OpenSSL present at runtime, which
# Alpine's minimal base doesn't include by default.
RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The standalone output only traces production JS dependencies -- Prisma's
# generated client (a build artifact, not something `next build` traces the
# same way) has to be copied in explicitly, alongside the schema/migrations
# `prisma migrate deploy` needs when run against this same image.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
# The `prisma` package above is the CLI's code, but `npx prisma` resolves
# the actual executable via node_modules/.bin/prisma (a shim npm creates at
# install time) -- without it, `npx prisma migrate deploy` (Phase 03) fails
# with "prisma: not found" even though the package itself is right there.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin ./node_modules/.bin
# bcryptjs is used both inside the Next.js app (where Next's build inlines
# it straight into the compiled server bundle, so it never appears as a
# standalone node_modules folder) and by prisma/bootstrap.mjs and
# prisma/seed.mjs, which run outside that bundler and need it resolvable
# the normal way -- same reasoning as the .bin copy above.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Prescription scans / logos / UPI QR codes (src/shared/storage.ts) land
# here -- mount a volume at this exact path (docker-compose.prod.yml does),
# or every redeploy silently wipes every uploaded file.
RUN mkdir -p /app/.data/uploads && chown -R nextjs:nodejs /app/.data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
