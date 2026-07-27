FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV DOCKER_BUILD=1

WORKDIR /app
COPY package.json ./
COPY pages ./pages
COPY scripts ./scripts

WORKDIR /app/pages

RUN set -ex && \
    mkdir -p en && \
    mv index.md en/index.md && \
    for d in guide features toolbar formats; do \
      mv "$d" "en/$d"; \
    done && \
    mv zh/index.md index.md && \
    for d in guide features toolbar formats; do \
      mv "zh/$d" "$d"; \
    done && \
    rm -rf zh

RUN find . -name '*.md' -not -path './en/*' -not -path './node_modules/*' \
    -exec sed -i 's|](/zh/|](/|g' {} + \
    -exec sed -i 's|link: /zh/|link: /|g' {} +

RUN pnpm install --frozen-lockfile && pnpm run build

FROM nginx:alpine

COPY --from=builder /app/pages/.vitepress/dist /usr/share/nginx/html
COPY pages/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
