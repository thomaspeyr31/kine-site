# Migrations

Pour faire évoluer la base **une fois le site en ligne** (sans perdre les données) :

1. Créez un fichier `NNN-description.sql` (ex. `001-ajout-colonne-notes.sql`) contenant vos `ALTER TABLE …`.
2. Reportez aussi la modification dans `../schema.sql` (utilisé pour les installations neuves).
3. Sur le serveur : `npm run db:migrate` (ou `docker compose exec app npm run db:migrate`).

Chaque fichier n'est exécuté qu'une seule fois (suivi dans la table `schema_migrations`).
