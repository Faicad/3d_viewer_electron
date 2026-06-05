FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV DOCKER_BUILD=1

WORKDIR /app
COPY package.json ./
COPY pages ./pages
COPY scripts ./scripts

WORKDIR /app/pages
RUN pnpm install --frozen-lockfile && pnpm run build

FROM nginx:alpine

COPY --from=builder /app/pages/.vitepress/dist /usr/share/nginx/html/3d_viewer_electron
COPY pages/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
