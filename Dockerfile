# Production frontend: Vite build + Nginx static server.
# API requests are proxied by the edge Nginx container (see deploy/nginx/).

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src

ARG VITE_API_URL=/api
ARG VITE_FORMILY_RUNTIME=true
# `surveys` builds the standalone surveys service; the default builds the whole platform
ARG VITE_APP_MODE=platform
# Seller details for the public offer and contacts pages (docs/ENV.md)
ARG VITE_LEGAL_FULL_NAME=
ARG VITE_LEGAL_INN=
ARG VITE_LEGAL_PHONE=
ARG VITE_LEGAL_ADDRESS=
ARG VITE_LEGAL_EMAIL=
ENV VITE_LEGAL_FULL_NAME=$VITE_LEGAL_FULL_NAME
ENV VITE_LEGAL_INN=$VITE_LEGAL_INN
ENV VITE_LEGAL_PHONE=$VITE_LEGAL_PHONE
ENV VITE_LEGAL_ADDRESS=$VITE_LEGAL_ADDRESS
ENV VITE_LEGAL_EMAIL=$VITE_LEGAL_EMAIL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_FORMILY_RUNTIME=$VITE_FORMILY_RUNTIME
ENV VITE_APP_MODE=$VITE_APP_MODE

RUN npm run build

FROM nginx:1.27-alpine

COPY deploy/nginx/frontend-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
