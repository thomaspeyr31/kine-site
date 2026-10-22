#!/bin/sh
# Sauvegarde de la base (Docker). À lancer chaque nuit via cron, depuis le dossier du projet :
#   crontab -e   →   30 3 * * * cd /chemin/vers/kine-site && sh deploy/backup.sh >> backups/backup.log 2>&1
# Restauration : gunzip -c backups/kine-AAAA-MM-JJ.sql.gz | docker compose exec -T db sh -c 'mariadb -u root -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"'
# ⚠️ Copiez aussi régulièrement le dossier backups/ HORS du serveur (autre machine, stockage objet…).
set -e
KEEP_DAYS=${KEEP_DAYS:-30}
mkdir -p backups
FILE="backups/kine-$(date +%F).sql.gz"
docker compose exec -T db sh -c 'mariadb-dump -u root -p"$MARIADB_ROOT_PASSWORD" --single-transaction --routines --triggers "$MARIADB_DATABASE"' | gzip > "$FILE"
find backups -name 'kine-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date '+%F %T') sauvegarde OK : $FILE ($(du -h "$FILE" | cut -f1))"
