# Lancer le site sous Windows (démonstration)

Comptez 10 minutes la première fois, puis un double-clic les fois suivantes.

## 1. Installer les deux logiciels nécessaires (une seule fois)

| Logiciel | Pourquoi | Où |
|---|---|---|
| **Node.js** (version LTS) | fait tourner le site | https://nodejs.org/fr/download → « Windows Installer (.msi) », installation par défaut |
| **XAMPP** | fournit la base de données MySQL (MariaDB) | https://www.apachefriends.org/fr/ → installation par défaut (seuls « MySQL » et « phpMyAdmin » sont utiles) |

> Vous avez déjà MySQL (MySQL Installer, WAMP, Laragon…) ? Gardez-le : l'installation vous demandera simplement le mot de passe `root`.

## 2. Démarrer MySQL

Ouvrez **XAMPP Control Panel** et cliquez sur **Start** en face de **MySQL** (la ligne devient verte).
À refaire après chaque redémarrage de l'ordinateur.

## 3. Récupérer le projet

Sur https://github.com/thomaspeyr31/kine-site : bouton vert **Code → Download ZIP**, puis clic droit sur le fichier → **Extraire tout…**
(ou `git clone https://github.com/thomaspeyr31/kine-site` si Git est installé)

## 4. Lancer

Dans le dossier du projet, **double-cliquez sur `demarrer-windows.bat`**.

La première fois, il installe les dépendances, crée la base `kine_db` avec des données de démonstration (6 programmes, 5 patients, des rendez-vous), puis ouvre le site dans le navigateur.
Si une question demande le mot de passe MySQL : **laissez vide et appuyez sur Entrée** avec XAMPP.

Si Windows affiche « Windows a protégé votre ordinateur » : **Informations complémentaires → Exécuter quand même** (le fichier est un simple script texte, ouvrable avec le Bloc-notes).

## Comptes de démonstration

| Rôle | E-mail | Mot de passe |
|---|---|---|
| Kiné (administration : agenda, patients, programmes, ventes) | `kine@cabinet.fr` | `MotDePasse123` |
| Patient (programmes achetés, rendez-vous, journal de séances) | `patient@test.fr` | `patient1234` |

La page de connexion propose aussi des boutons « Remplir ».

## Idées de parcours pour la démonstration

1. **Visiteur** : accueil → catalogue → fiche d'un programme → prise de rendez-vous (calendrier, créneaux, formulaire).
2. **Patient** : connexion → achat d'un programme (paiement simulé) → cocher des exercices → noter une séance dans le journal → facture PDF dans « Mon espace ».
3. **Kiné** : connexion → agenda de la semaine → clic sur un RDV (fiche, notes de séance, statut) → onglet Patients → fiche avec historique et courbe de douleur → ajouter un RDV en cliquant sur un créneau vide.
4. **Base MySQL** : ouvrez http://localhost/phpmyadmin (Apache doit être démarré dans XAMPP) → base `kine_db` → tables `patients`, `appointments`, `orders`…

## Remettre la démo à zéro

Double-cliquez sur **`reinitialiser-demo-windows.bat`** : toutes les données saisies sont effacées et les données de démonstration recréées.

## En cas de problème

| Message | Solution |
|---|---|
| « Node.js n'est pas installé » | Installez Node.js (étape 1), **fermez puis rouvrez** le dossier, relancez. |
| « MySQL / MariaDB ne répond pas » | XAMPP Control Panel → **Start** en face de MySQL. |
| MySQL ne démarre pas dans XAMPP (port 3306 occupé) | Un autre MySQL tourne déjà : utilisez-le (son mot de passe root sera demandé) ou arrêtez-le dans les Services Windows. |
| « Mot de passe incorrect » | XAMPP : laissez vide. MySQL Installer : mot de passe `root` choisi à l'installation. |
| Le navigateur affiche « Impossible d'accéder au site » | Attendez quelques secondes et actualisez : le site démarre. La fenêtre noire doit rester ouverte. |
| `EADDRINUSE` / port 3000 utilisé | Le site tourne déjà dans une autre fenêtre : fermez-la, ou ouvrez simplement http://localhost:3000. |

En ligne de commande (PowerShell, dans le dossier du projet), les mêmes étapes : `npm install`, `npm run setup`, `npm start`.
