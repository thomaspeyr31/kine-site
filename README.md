# Cabinet de kiné — programmes de rééducation + prise de RDV

Site complet : **front** (HTML/CSS/JS), **back** (Node.js + Express), **base MySQL / MariaDB**, paiement **Stripe**, **prise de rendez-vous** avec calendrier, **factures PDF**, prêt à être hébergé (**Docker + HTTPS automatique**).

👉 **Mise en ligne : voir [DEPLOIEMENT.md](DEPLOIEMENT.md)**

## Fonctionnalités

**Patients**
- Catalogue de programmes, filtre par zone, fiche avec aperçu de la semaine 1
- Achat par carte (Stripe Checkout) avec acceptation des CGV et renonciation au droit de rétractation (contenu numérique)
- Facture PDF numérotée envoyée par e-mail et téléchargeable
- Programme semaine par semaine, exercices à cocher, progression enregistrée (retrouvée sur tous les appareils)
- Prise de RDV : calendrier → créneau → infos (nom, e-mail, tél., naissance, ordonnance, motif)
- E-mail de confirmation, **rappel la veille**, lien d'annulation (jusqu'à 24 h avant, réglable)
- Espace personnel : programmes, RDV, factures, modification du profil et du mot de passe
- **Mot de passe oublié** (lien par e-mail, valable 1 h)
- RGPD : téléchargement de ses données, suppression du compte

**Kiné (`/admin.html`)**
- Tableau de bord (RDV du jour, ventes, patients)
- RDV : liste, statuts (confirmé, annulé, terminé, **absent**), **ajout manuel** (RDV pris par téléphone, e-mail facultatif), **déplacement**, e-mail automatique au patient
- Programmes et exercices (modifier un programme conserve la progression des patients)
- Ventes, factures PDF, **export comptable CSV**
- Horaires d'ouverture, congés, **plages bloquées** (ex. réunion de 14 h à 16 h)

**Technique**
- Sécurité : mots de passe bcrypt, sessions en base, cookies `Secure/HttpOnly`, CSP stricte, anti-CSRF, limitation des tentatives, déconnexion des autres appareils au changement de mot de passe
- Purge automatique des vieux RDV (RGPD, 36 mois par défaut)
- Migrations de base sans perte de données (`npm run db:migrate`)
- `/api/health` (supervision), `robots.txt`, `sitemap.xml`
- Arrêt propre, alertes au démarrage si la configuration de production est incomplète

## Installation en local (développement)

Prérequis : Node.js 20+ et MySQL 8 ou MariaDB 10.5+ démarré.

```bash
npm install
cp .env.example .env
```

Créer la base (une seule fois) :
```bash
mariadb -e "CREATE DATABASE kine_db CHARACTER SET utf8mb4; CREATE USER 'kine'@'localhost' IDENTIFIED BY 'kine_pass'; GRANT ALL ON kine_db.* TO 'kine'@'localhost';"
```
(avec MySQL : `mysql -u root -p -e "…"`)

```bash
npm run db:init        # tables + 6 programmes + comptes de démo (⚠️ efface les données existantes)
npm start              # → http://localhost:3000
```

Comptes de démonstration (développement uniquement, recréés à chaque `db:init`) :

| Rôle | E-mail | Mot de passe |
|---|---|---|
| Kiné (administrateur) | `kine@cabinet.fr` | `MotDePasse123` |
| Patient | `patient@test.fr` | `patient1234` |

Ils sont aussi rappelés sur la page de connexion en mode développement (bouton « Remplir »).

Sans clé Stripe, les achats sont validés sans paiement (mode démo). Sans SMTP, les e-mails s'affichent dans le terminal (voir « E-mails » ci-dessous).

⚠️ Le compte **kiné (admin)** a accès à tous les programmes : il ne voit donc pas de bouton d'achat. Pour tester un achat, créez un compte patient (« Connexion » → « Créer un compte »).

## E-mails

Sans configuration SMTP, **aucun e-mail n'est envoyé** : ils s'affichent dans le terminal où tourne `npm start` (confirmations de RDV, factures, liens « mot de passe oublié »…).

Pour les recevoir vraiment pendant vos tests, le plus simple est Gmail :
1. Activez la validation en 2 étapes sur votre compte Google.
2. Créez un mot de passe d'application : https://myaccount.google.com/apppasswords (16 lettres).
3. Dans `.env` :
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=votre.adresse@gmail.com
   SMTP_PASS=abcdefghijklmnop
   SMTP_FROM=Cabinet Élan <votre.adresse@gmail.com>
   ```
4. Testez : `npm run test-mail -- votre.adresse@gmail.com`, puis redémarrez le site.

En production, préférez un service d'envoi transactionnel (Brevo, Mailjet, OVH…) avec SPF/DKIM configurés sur votre domaine.

## Commandes

| Commande | Rôle |
|---|---|
| `npm start` | Démarre le site |
| `npm run dev` | Démarre et redémarre à chaque modification du code |
| `npm run db:init` | **Développement** : recrée toutes les tables + démo (bloqué en production) |
| `npm run db:migrate` | Installe la base si elle est vide, sinon applique les évolutions — sans perte |
| `npm run create-admin -- email "mdp" Prénom Nom` | Crée le compte du kiné (ou change son mot de passe) |
| `npm run test-mail -- adresse@exemple.fr` | Vérifie la configuration SMTP et envoie un e-mail de test |

## Structure

```
database/
  schema.sql          tables (installation neuve)
  seed.sql            programmes + horaires de démo
  demo-accounts.sql   comptes kiné + patient de test (développement uniquement)
  migrations/         évolutions futures de la base
src/
  server.js           Express, sécurité, routes, arrêt propre
  config.js           lecture du .env + vérifications production
  jobs.js             rappels de RDV, purge RGPD
  migrate.js          installation / mise à jour de la base
  routes/             auth · programs · orders (Stripe) · appointments · account · admin
  lib/                slots (créneaux) · invoice (factures PDF) · mailer · auth · http
public/               pages HTML, css/, js/ (un script par page)
deploy/               Caddyfile (HTTPS), backup.sh, nginx.conf
Dockerfile, docker-compose.yml, ecosystem.config.js (pm2)
```

## Base de données

`users` · `password_resets` · `programs` · `program_exercises` · `program_progress` · `orders` · `counters` (numéros de facture) · `appointments` · `opening_hours` · `closures` · `sessions` · `schema_migrations`.

- Un index unique empêche deux réservations sur le même créneau, même en cas de clics simultanés.
- Les commandes gardent une copie du nom et de l'e-mail de facturation : les factures restent valables 10 ans même si le client supprime son compte.
