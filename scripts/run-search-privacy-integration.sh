#!/bin/sh
set -eu

suffix="$$"
network="marbo3a-search-test-$suffix"
postgres="marbo3a-search-postgres-$suffix"
redis="marbo3a-search-redis-$suffix"

cleanup(){
  docker rm -f "$postgres" "$redis" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker network create "$network" >/dev/null
docker run -d --rm --name "$postgres" --network "$network" -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test postgres:16-alpine >/dev/null
docker run -d --rm --name "$redis" --network "$network" redis:7-alpine >/dev/null

until docker exec "$postgres" pg_isready -U test -d test >/dev/null 2>&1; do sleep 1; done
until docker exec "$redis" redis-cli ping >/dev/null 2>&1; do sleep 1; done

docker run --rm --network "$network" --entrypoint sh \
  -e INTEGRATION_DATABASE_URL="postgresql://test:test@$postgres:5432/test" \
  -e INTEGRATION_REDIS_URL="redis://$redis:6379" \
  -v "$(pwd)/backend:/source:ro" \
  marbo3a-api -c 'cp -a /source/. /app/ && node --test /app/tests/search-privacy.integration.test.mjs'
