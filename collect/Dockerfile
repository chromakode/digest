FROM denoland/deno:1.45.2

RUN mkdir /output
RUN chown deno:deno /output
ENV OUTPUT_DIR /output

WORKDIR /app/collect

USER deno

COPY collect/deps.ts deps.ts
RUN deno cache deps.ts

COPY collect .
COPY shared ../shared
RUN deno cache src/main.ts

CMD ["run", "--allow-net", "--allow-env", "--allow-read=/app,/output", "--allow-write=/output", "src/main.ts"]