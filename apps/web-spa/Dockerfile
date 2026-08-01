# Contexto de build: la raíz del repo (ver docker-compose.yml). Multi-stage:
# build con Node y estático final en nginx. Los tipos del contrato van
# commiteados (types.gen.ts), así que el build no necesita apps/api-gateway/docs
# (excluido del contexto por .dockerignore) — ADR-0017.
FROM node:24-alpine AS build
WORKDIR /opt/ves/apps/web-spa
COPY apps/web-spa/package.json apps/web-spa/package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY apps/web-spa/ .
RUN npm run build

FROM nginx:alpine
COPY --from=build /opt/ves/apps/web-spa/dist /usr/share/nginx/html
COPY apps/web-spa/nginx.conf /etc/nginx/conf.d/default.conf
# Fuera de conf.d a propósito: es un fragmento para `include`, no un server.
COPY apps/web-spa/nginx-security-headers.conf /etc/nginx/security-headers.conf
EXPOSE 80
