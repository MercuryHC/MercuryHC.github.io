FROM node:22-alpine
WORKDIR /app
COPY notification-core.js /app/notification-core.js
COPY serverchan-bridge/server.cjs /app/serverchan-bridge/server.cjs
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8787
CMD ["node", "serverchan-bridge/server.cjs"]
