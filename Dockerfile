# 학교 게임 모음 서버 (Coolify 등에서 빌드) — 외부 패키지 없음
FROM node:20-alpine
WORKDIR /app
COPY server ./server
ENV PORT=8080 DATA_DIR=/data
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "server/node-server.mjs"]
