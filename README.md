# Journal downloads service

This service proxies S3 file resources to clients using the download ID and hashing format used by https://github.com/elifesciences/journal

This allows us to offload the streaming of data from the main PHP application (something is not very good at).

This is built using Bun.js, to give zero dependencies in prod, but currently requires @aws-sdk/credential-provider-web-identity for cluster dpeloyment until the bun s3 client supports web-identity

## development

Using Mise, first `mise install`

### Run a dev server

Set any variables for AWS that you want to set, then run `mise dev`

### Run test suite

run `mise test`

## Building the docker image

We build a docker image from the `Dockerfile` in CI for every commit to main branch for amd64 and arm64. This is using `bun build --compile` to create a standalone binary, then copying this to a distroless image base.

If you wish to build an image to run locally, for another platform, or just to retag and push somewhere else, you can use `mise build {tag_name}` and it will build and load the image as journal-downloads:${tag_name} using docker buildx.

## Utils

### `generate-link`

There is a utility to generate a URL for a running instance of the journal-downloads service.

First, set a shared secret as SECRET env var.

Then run `mise generate-link --url {url_to_download} --host {journal_download_host_prefix} --filename {download_file_name}`, for example:

```
bun run src/generateDownloadLink.ts --url http://icanhazip.com --host http://localhost:3000 --filename my-ip.txt
```
