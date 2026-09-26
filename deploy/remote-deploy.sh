#!/bin/sh
set -eu

: "${IMAGE_TAG:?Set IMAGE_TAG to the release commit SHA}"
: "${IMAGE_REPOSITORY:?Set IMAGE_REPOSITORY to the registry repository}"
case "$IMAGE_TAG" in
  *[!a-zA-Z0-9._-]* | '') echo 'Invalid IMAGE_TAG' >&2; exit 2 ;;
esac
case "$IMAGE_REPOSITORY" in
  *[!a-zA-Z0-9._/-]* | '' | -* | /* | *..*) echo 'Invalid IMAGE_REPOSITORY' >&2; exit 2 ;;
esac

test -f .env || { echo 'Missing production .env in deploy directory' >&2; exit 2; }
sudo -n docker pull "$IMAGE_REPOSITORY:$IMAGE_TAG"

previous_container=$(sudo -n docker compose -f compose.prod.yaml ps -q app)
previous_image=''
if [ -n "$previous_container" ]; then
  previous_image=$(sudo -n docker inspect --format '{{.Image}}' "$previous_container")
fi

if sudo -n env IMAGE_REPOSITORY="$IMAGE_REPOSITORY" IMAGE_TAG="$IMAGE_TAG" docker compose -f compose.prod.yaml up -d --wait --wait-timeout 180; then
  sudo -n docker tag "$IMAGE_REPOSITORY:$IMAGE_TAG" forge-lane:latest
  echo "Deployed $IMAGE_REPOSITORY:$IMAGE_TAG"
  exit 0
fi

echo "Deployment of $IMAGE_REPOSITORY:$IMAGE_TAG failed" >&2
if [ -n "$previous_image" ]; then
  sudo -n docker tag "$previous_image" forge-lane:rollback
  if sudo -n env IMAGE_REPOSITORY=forge-lane IMAGE_TAG=rollback docker compose -f compose.prod.yaml up -d --wait --wait-timeout 180; then
    echo 'Previous application image restored' >&2
  else
    echo 'Rollback failed; manual recovery required' >&2
  fi
fi
exit 1
