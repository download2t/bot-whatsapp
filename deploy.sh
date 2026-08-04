#!/usr/bin/env bash
set -euo pipefail

# Deploy simplificado do BOTZAP em produção (mydevsystem.site)

git stash
git pull

sudo systemctl stop mydev_api mydev_bridge

cd /opt/mydevsystem/ApiBotWhatsapp.Api
ASPNETCORE_ENVIRONMENT=Production \
Jwt__SigningKey=8f3d2a1c7b9e4f0d6a5c1e8f2d4b6a9c3e1f7a2d4c6b8e0f1a3d5c7b9e1f4a6 \
ConnectionStrings__DefaultConnection="Data Source=/opt/mydevsystem/data/app.db" \
dotnet ef database update

dotnet publish -c Release -o /opt/mydevsystem/publish/api

cd /opt/mydevsystem/frontend
npm install
npm run build
sudo rm -rf /var/www/mydevsystem/ui/*
sudo cp -r dist/* /var/www/mydevsystem/ui/
sudo chown -R www-data:www-data /var/www/mydevsystem/ui

cd /opt/mydevsystem/whatsapp-bridge
npm install

sudo systemctl start mydev_api mydev_bridge
sudo systemctl restart nginx

echo "✅ Deploy concluído com sucesso!"
