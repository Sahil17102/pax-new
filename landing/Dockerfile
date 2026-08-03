FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS backend-build

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

# Key the backend source layer to Render's commit so backend seed/config
# changes always invalidate this compatibility image.
ARG RENDER_GIT_COMMIT=main
RUN git init /source \
    && cd /source \
    && git remote add origin https://github.com/Sahil17102/pax-new.git \
    && git fetch --depth 1 origin "${RENDER_GIT_COMMIT}" \
    && git checkout --detach FETCH_HEAD

WORKDIR /source/backend
RUN npm ci --include=dev
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ARG RENDER_GIT_COMMIT=main
LABEL org.opencontainers.image.revision=$RENDER_GIT_COMMIT

WORKDIR /app/landing
ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
COPY --from=backend-build /source/backend /app/backend

EXPOSE 10000

CMD ["node", "scripts/service-entrypoint.mjs"]
