# Journal downloads service

This service proxies S3 file resources to clients using the download ID and hashing format used by https://github.com/elifesciences/journal

This allows us to offload the streaming of data from the main PHP application (something is not very good at).

This is built using Bun.js, to give zero dependencies in prod.

## development

Using Mise, first `mise install`

### Run a dev server

Set any variables for AWS that you want to set, then run `mise dev`

### Run test suite

run `mise test`
