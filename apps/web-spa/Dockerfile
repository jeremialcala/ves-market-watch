# Contexto de build: la raíz del repo (ver docker-compose.yml). Multi-stage:
# build con Node y estático final en nginx. Los tipos del contrato van
# commiteados (types.gen.ts), así que el build no necesita apps/api-gateway/docs
# (excluido del contexto por .dockerignore) — ADR-0017.
#
# La config de Auth0/API entra por ARG y alimenta DOS destinos: el bundle (Vite
# hornea las VITE_* en build) y la CSP del nginx (plantilla + envsubst). Un solo
# input para ambos: así no pueden divergir, que es el fallo que este diseño
# previene (ver nginx-security-headers.conf.template). Los defaults reproducen
# el compose de dev, de modo que `docker compose build` sin variables se
# comporta exactamente como antes.
ARG VITE_AUTH0_DOMAIN=auth.higerotech.com
ARG VITE_AUTH0_CLIENT_ID=8CpfA64FlGTmuyF8w07rDFlrZHEeuRER
ARG VITE_AUTH0_AUDIENCE=https://api.vesmarketwatch/
ARG VITE_API_BASE_URL=http://localhost:8800

FROM node:24-alpine AS build
ARG VITE_AUTH0_DOMAIN
ARG VITE_AUTH0_CLIENT_ID
ARG VITE_AUTH0_AUDIENCE
ARG VITE_API_BASE_URL
ENV VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN \
    VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID \
    VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE \
    VITE_API_BASE_URL=$VITE_API_BASE_URL
WORKDIR /opt/ves/apps/web-spa
COPY apps/web-spa/package.json apps/web-spa/package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY apps/web-spa/ .
RUN npm run build

FROM nginx:alpine
ARG VITE_AUTH0_DOMAIN
ARG VITE_API_BASE_URL
COPY --from=build /opt/ves/apps/web-spa/dist /usr/share/nginx/html
COPY apps/web-spa/nginx.conf /etc/nginx/conf.d/default.conf
# Fuera de conf.d a propósito: es un fragmento para `include`, no un server.
# La lista explícita de variables en envsubst NO es opcional: sin ella se comería
# las $uri/$host propias de nginx. El grep final es el cinturón — una variable
# sin sustituir dejaría un `${...}` literal en la CSP, que es exactamente el
# fallo de "cabecera escrita que no protege" que ya nos costó una vez. Ignora
# los comentarios a propósito: la prosa de la plantilla menciona las variables.
COPY apps/web-spa/nginx-security-headers.conf.template /tmp/security-headers.template
RUN export VITE_AUTH0_DOMAIN="$VITE_AUTH0_DOMAIN" \
 && export VITE_API_BASE_URL="$VITE_API_BASE_URL" \
 && export VITE_WS_BASE_URL="$(printf '%s' "$VITE_API_BASE_URL" | sed 's|^http|ws|')" \
 && envsubst '${VITE_AUTH0_DOMAIN} ${VITE_API_BASE_URL} ${VITE_WS_BASE_URL}' \
      < /tmp/security-headers.template > /etc/nginx/security-headers.conf \
 && rm /tmp/security-headers.template \
 && ! grep -v '^[[:space:]]*#' /etc/nginx/security-headers.conf | grep -q '\${'
EXPOSE 80
