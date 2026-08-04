#!/usr/bin/env bash
set -euo pipefail

# Deploy automatizado simplificado do BOTZAP (mydevsystem.site)
# Uso: sudo ./deploy.sh
# Executar dentro de /opt/mydevsystem

APP_DIR="/opt/mydevsystem"
API_DIR="$APP_DIR/ApiBotWhatsapp.Api"
FRONTEND_DIR="$APP_DIR/frontend"
BRIDGE_DIR="$APP_DIR/whatsapp-bridge"
PUBLISH_DIR="$APP_DIR/publish/api"
WEB_ROOT="/var/www/mydevsystem/ui"
DB_PATH="$APP_DIR/data/app.db"
JWT_SIGNING_KEY="8f3d2a1c7b9e4f0d6a5c1e8f2d4b6a9c3e1f7a2d4c6b8e0f1a3d5c7b9e1f4a6"

log() { echo -e "\n\033[1;36m==> $1\033[0m"; }
fail() { echo -e "\033[1;31mERRO: $1\033[0m" >&2; exit 1; }

[ "$EUID" -eq 0 ] || fail "rode com sudo: sudo ./deploy.sh"
[ -d "$APP_DIR" ] || fail "$APP_DIR não existe — ajuste APP_DIR no topo do script."

cd "$APP_DIR"

log "1/8 - Atualizando código"
git stash
git pull

log "2/8 - Parando serviços"
systemctl stop mydev_api mydev_bridge || true

log "3/8 - Backup do banco"
mkdir -p "$(dirname "$DB_PATH")"
if [ -f "$DB_PATH" ]; then
  cp "$DB_PATH" "$DB_PATH.backup-$(date +%Y%m%d-%H%M%S)"
else
  echo "Aviso: $DB_PATH ainda não existe — pulando backup."
fi

log "4/8 - Restaurando dependências da API"
cd "$API_DIR"
dotnet restore

log "5/8 - Atualizando banco (EF Core)"
export PATH="$PATH:/root/.dotnet/tools"
if ! command -v dotnet-ef &>/dev/null; then
  dotnet tool install --global dotnet-ef --version 10.0.3
fi

ASPNETCORE_ENVIRONMENT=Production \
Jwt__SigningKey="$JWT_SIGNING_KEY" \
ConnectionStrings__DefaultConnection="Data Source=$DB_PATH" \
dotnet ef database update

log "6/8 - Publicando API"
dotnet publish -c Release -o "$PUBLISH_DIR"

log "7/8 - Build do frontend"
cd "$FRONTEND_DIR"
npm install
npm run build
rm -rf "${WEB_ROOT:?}"/*
cp -r dist/* "$WEB_ROOT"/
chown -R www-data:www-data "$WEB_ROOT"

log "8/8 - Atualizando bridge e reiniciando serviços"
cd "$BRIDGE_DIR"
npm install
systemctl start mydev_api mydev_bridge
systemctl restart nginx

log "Verificando saúde"
sleep 3
curl -sf http://127.0.0.1:5207/health >/dev/null && echo "API: OK" || echo "API: FALHOU"
curl -sf http://127.0.0.1:3001/health >/dev/null && echo "Bridge: OK" || echo "Bridge: FALHOU"

echo -e "\n✅ Deploy concluído com sucesso!"
