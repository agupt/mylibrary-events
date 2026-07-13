# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage — Next standalone output (~150MB image)
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Feed cache (stale-while-revalidate disk layer). On Fly, mount a volume
# here to survive restarts; without one it rebuilds on first requests.
ENV FEED_CACHE_DIR=/app/.cache/feeds
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/.cache/feeds && chown -R app:app /app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
