# Mettre le site en ligne

Ce guide part d'un serveur vierge et aboutit au site en HTTPS sur votre nom de domaine.
Comptez environ 1 h la première fois.

---

## 0. Avant de commencer (hors technique)

Ces points ne dépendent pas du code mais sont **obligatoires** avant d'ouvrir le site au public :

| À faire | Pourquoi |
|---|---|
| **Choisir un hébergement certifié HDS** | Le motif de consultation, l'ordonnance et le fait même de prendre RDV chez un kiné sont des données de santé (art. L1111-8 du Code de la santé publique). Vérifiez que **l'offre précise** que vous louez est certifiée HDS, pas seulement l'hébergeur. Alternative : confier les RDV à un outil certifié (Doctolib…) et ne garder ici que la vente de programmes. |
| **Faire relire les CGV et mentions légales** (`public/cgv.html`, `public/mentions-legales.html`) | Modèles fournis, à compléter (médiateur de la consommation, date…). |
| **Valider la TVA avec votre comptable** | Les soins sont exonérés, la vente de programmes en ligne a priori non. Réglez `VAT_RATE` en conséquence. |
| **Compte Stripe activé** (pièce d'identité, IBAN) | Pour encaisser réellement. |
| **Une adresse d'envoi d'e-mails** (Brevo, OVH, Google Workspace…) | Confirmations, rappels, factures, mot de passe oublié. |
| **Un nom de domaine** (OVH, Gandi, Infomaniak…) | ex. `cabinet-elan.fr`. |

---

## 1. Le serveur

Un VPS Linux (Ubuntu 24.04 ou Debian 12) avec **2 Go de RAM** suffit.

1. Chez votre registrar, créez un enregistrement DNS **A** : `mon-cabinet.fr` → adresse IP du serveur, et un second pour `www.mon-cabinet.fr` (même IP).
2. Connectez-vous au serveur et installez Docker :
   ```bash
   ssh root@IP_DU_SERVEUR
   curl -fsSL https://get.docker.com | sh
   ```
3. Ouvrez uniquement les ports nécessaires :
   ```bash
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
   ```

## 2. Le site

1. Envoyez le projet sur le serveur (depuis votre Mac, dans le dossier qui contient `kine-site`) :
   ```bash
   scp -r kine-site root@IP_DU_SERVEUR:/opt/
   ```
   (ou `git clone` si vous l'avez mis sur GitHub — le fichier `.env` n'y est jamais envoyé.)
2. Sur le serveur, créez la configuration :
   ```bash
   cd /opt/kine-site
   cp .env.production.example .env
   nano .env
   ```
   Remplissez tout ce qui est entre `< >`. Pour les mots de passe et le secret :
   ```bash
   openssl rand -hex 32
   ```
3. Lancez tout (base de données + site + HTTPS) :
   ```bash
   docker compose up -d --build
   docker compose logs -f app
   ```
   Vous devez voir `✔ Base installée` puis `✔ … en ligne sur https://…`.
   Les lignes `⚠` indiquent ce qui manque encore dans `.env`. (`Ctrl + C` pour quitter les logs.)
4. Créez le compte du kiné :
   ```bash
   docker compose exec app npm run create-admin -- votre@email.fr "UnMotDePasseSolide" Prénom Nom
   ```
5. Ouvrez `https://mon-cabinet.fr`, connectez-vous, puis dans **Administration** :
   - **Horaires & congés** : vos horaires réels ;
   - **Programmes** : créez vos programmes (la base de production démarre vide).

Le certificat HTTPS est obtenu et renouvelé automatiquement par Caddy.

## 3. Stripe

1. dashboard.stripe.com → **Développeurs → Clés API** : copiez la clé secrète dans `STRIPE_SECRET_KEY`.
   Commencez par la clé `sk_test_…` pour un dernier essai sur le vrai domaine, puis passez à `sk_live_…`.
2. **Développeurs → Webhooks → Ajouter un endpoint** :
   - URL : `https://mon-cabinet.fr/api/stripe/webhook`
   - Événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`
   - Copiez le « secret de signature » (`whsec_…`) dans `STRIPE_WEBHOOK_SECRET`.
3. Appliquez : `docker compose up -d`
4. Test : achetez un programme avec la carte `4242 4242 4242 4242` (mode test) → vous devez recevoir la facture par e-mail et la voir dans « Mon espace ».

Remboursement : depuis le tableau de bord Stripe. Le site retire l'accès au programme et marque la vente « Remboursé » automatiquement.

## 4. E-mails

Renseignez `SMTP_*` avec les identifiants de votre fournisseur, puis chez votre registrar ajoutez les enregistrements **SPF** et **DKIM** qu'il vous indique (sinon les e-mails finissent en spam).
Test : « Mot de passe oublié » avec votre adresse.

## 5. Sauvegardes (indispensable)

Sauvegarde chaque nuit à 3 h 30, conservée 30 jours :
```bash
crontab -e
```
ajoutez la ligne :
```
30 3 * * * cd /opt/kine-site && sh deploy/backup.sh >> backups/backup.log 2>&1
```
**Copiez aussi `backups/` hors du serveur** (autre machine, stockage objet…) : une sauvegarde sur le même serveur ne protège pas d'une panne de ce serveur.

Restaurer une sauvegarde :
```bash
gunzip -c backups/kine-2026-11-03.sql.gz | docker compose exec -T db sh -c 'mariadb -u root -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"'
```

## 6. Surveillance

Créez une sonde gratuite (UptimeRobot, Better Stack…) sur `https://mon-cabinet.fr/api/health` : vous serez prévenu par e-mail si le site ou la base tombe.

## 7. Mettre à jour le site

Après avoir remplacé les fichiers (nouvelle version) :
```bash
cd /opt/kine-site
docker compose up -d --build
```
Les évolutions de base de données (`database/migrations/`) s'appliquent automatiquement au démarrage, sans perte de données.
**Ne lancez jamais `npm run db:init` en production** : il efface tout (il est d'ailleurs bloqué).

## Commandes utiles

| Action | Commande |
|---|---|
| Voir les logs | `docker compose logs -f app` |
| Redémarrer après une modif du `.env` | `docker compose up -d` |
| État des services | `docker compose ps` |
| Réinitialiser le mot de passe du kiné | `docker compose exec app npm run create-admin -- email "NouveauMdp" Prénom Nom` |
| Console SQL | `docker compose exec db sh -c 'mariadb -u root -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"'` |
| Arrêter le site | `docker compose down` (les données sont conservées) |

---

## Alternative sans Docker

Sur un serveur avec Node.js 20+ et MySQL/MariaDB déjà installés :
```bash
cd /opt/kine-site
npm ci --omit=dev
cp .env.production.example .env && nano .env   # DB_HOST=localhost, NODE_ENV=production
npm run db:migrate                             # installe la base
npm run create-admin -- email "MotDePasse" Prénom Nom
npm i -g pm2 && pm2 start ecosystem.config.js && pm2 save && pm2 startup
```
Puis Nginx en reverse proxy (`deploy/nginx.conf`) et HTTPS avec `certbot --nginx`.
Adaptez `deploy/backup.sh` pour utiliser `mysqldump` directement.

## Hébergement « clé en main » (PaaS)

Render, Railway, Scalingo, Clever Cloud… fonctionnent aussi : ils construisent le `Dockerfile` fourni ; ajoutez une base MySQL/MariaDB managée et recopiez les variables du `.env` dans leur interface. Vérifiez là aussi la certification HDS si vous gardez la prise de RDV.

---

## Dernière vérification avant d'annoncer le site

- [ ] `docker compose logs app` n'affiche plus aucune ligne `⚠`
- [ ] Achat test → facture reçue par e-mail, numéro `F2026-00001`
- [ ] RDV test → e-mail de confirmation reçu, lien d'annulation fonctionnel
- [ ] « Mot de passe oublié » → e-mail reçu
- [ ] Mentions légales et CGV complètes (SIRET, RPPS, hébergeur, médiateur)
- [ ] Sauvegarde nocturne en place **et** copiée hors du serveur
- [ ] Sonde de surveillance sur `/api/health`
- [ ] Achats et RDV de test supprimés (ou base réinstallée)
