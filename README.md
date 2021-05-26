# Github Project Kit

A kit for Github project board, that calculates some metric. Current supported:
- Cycle Time


# How to use

## Prepare

- Install [Deno](https://deno.land/#installation)
- Milestone is required

## Configure

Configure your `.env` as below:

```sh
export GRAPHQL_ENDPOINT=<Your GITHUB domain>/api/graphql
export GITHUB_TOKEN=<Your Personal access tokens>
export GITHUB_OWNER=<Your owner name>
export GITHUB_PROJECT_NAME=<Your project name>

```

## Run

```
source .env
deno  run --allow-net  --allow-env  --allow-write kit.js
```

You will get your data from `output.csv` file
