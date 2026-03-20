FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps ./apps

RUN npm ci
RUN npm run build --workspace=flash-sale-web

FROM nginx:1.27-alpine

COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
