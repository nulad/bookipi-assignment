FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps ./apps

RUN npm ci

EXPOSE 3000

CMD ["npm", "run", "start:container", "--workspace=flash-sale-api"]
