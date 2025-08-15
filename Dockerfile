FROM oven/bun AS build

WORKDIR /app
COPY package.json package.json
COPY bun.lock bun.lock
RUN bun install

COPY ./src ./src

ENV NODE_ENV=production
RUN bun build src/index.ts --compile  --outfile=journal-downloads --minify --sourcemap --bytecode


FROM gcr.io/distroless/cc
WORKDIR /app
COPY --from=build /app/journal-downloads journal-downloads
CMD [ "./journal-downloads" ]
