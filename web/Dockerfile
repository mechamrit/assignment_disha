# Build context: repository root (see docker-compose.yml).
FROM node:20.20.2-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json .npmrc ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci -w web
COPY web/ web/
ARG VITE_API_BASE_URL=http://localhost:4000
ARG VITE_BOT_OFFER_URL=http://localhost:7860/api/offer
ARG VITE_POLL_MS=3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_BOT_OFFER_URL=$VITE_BOT_OFFER_URL \
    VITE_POLL_MS=$VITE_POLL_MS
RUN npm run build -w web

FROM nginx:1.31.5-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/web/dist /usr/share/nginx/html
EXPOSE 80
