$ErrorActionPreference = "Stop"

if (docker compose version *> $null) {
  Write-Host "Using: docker compose"
  docker compose pull
  docker compose up -d --force-recreate
} elseif (Get-Command docker-compose -ErrorAction SilentlyContinue) {
  Write-Host "Using: docker-compose"
  docker-compose pull
  docker-compose up -d --force-recreate
} else {
  Write-Error "Neither 'docker compose' nor 'docker-compose' is available."
  exit 1
}

Write-Host "Done."
