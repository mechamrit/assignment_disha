# Build context: repository root (see docker-compose.yml).
FROM node:20.20.2-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json .npmrc ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci -w api
COPY api/ api/
RUN npm run build -w api

FROM node:20.20.2-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json .npmrc ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci -w api --omit=dev && npm cache clean --force
COPY --from=build /repo/api/dist api/dist
WORKDIR /repo/api
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
