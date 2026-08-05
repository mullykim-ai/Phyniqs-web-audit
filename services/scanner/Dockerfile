FROM mcr.microsoft.com/playwright:v1.62.1-noble AS build
WORKDIR /app
COPY services/scanner/package*.json ./
RUN npm ci
COPY services/scanner/tsconfig.json ./
COPY services/scanner/src ./src
RUN npm run build && npm prune --omit=dev

FROM mcr.microsoft.com/playwright:v1.62.1-noble
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY services/scanner/package.json ./
COPY services/scanner/sql ./sql
USER pwuser
CMD ["node", "dist/server.js"]
