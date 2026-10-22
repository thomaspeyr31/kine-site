-- =========================================================
--  Cabinet de kinésithérapie — schéma MySQL 8 / MariaDB 10.5+
--  Installation neuve : npm run db:init
--  Évolutions ultérieures : fichiers database/migrations/NNN-*.sql + npm run db:migrate
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS schema_migrations;
DROP TABLE IF EXISTS counters;
DROP TABLE IF EXISTS password_resets;
DROP TABLE IF EXISTS program_progress;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS closures;
DROP TABLE IF EXISTS opening_hours;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS program_exercises;
DROP TABLE IF EXISTS programs;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------
-- Utilisateurs (patients + kiné administrateur)
-- ---------------------------------------------------------
CREATE TABLE users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  first_name      VARCHAR(80)  NOT NULL,
  last_name       VARCHAR(80)  NOT NULL,
  email           VARCHAR(190) NOT NULL,
  phone           VARCHAR(30)  NULL,
  password_hash   VARCHAR(100) NOT NULL,
  role            ENUM('client','admin') NOT NULL DEFAULT 'client',
  session_version INT UNSIGNED NOT NULL DEFAULT 1,     -- incrémenté au changement de mot de passe : déconnecte les autres appareils
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Liens "mot de passe oublié" (seule l'empreinte SHA-256 du jeton est stockée)
CREATE TABLE password_resets (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reset_token (token_hash),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Programmes de rééducation vendus en ligne
-- ---------------------------------------------------------
CREATE TABLE programs (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug              VARCHAR(120) NOT NULL,
  title             VARCHAR(150) NOT NULL,
  body_area         VARCHAR(60)  NOT NULL,           -- genou, épaule, dos…
  level             ENUM('debutant','intermediaire','avance') NOT NULL DEFAULT 'debutant',
  short_description VARCHAR(255) NOT NULL,
  description       TEXT NOT NULL,
  duration_weeks    TINYINT UNSIGNED NOT NULL DEFAULT 4,
  sessions_per_week TINYINT UNSIGNED NOT NULL DEFAULT 3,
  price_cents       INT UNSIGNED NOT NULL,           -- prix TTC
  is_published      TINYINT(1) NOT NULL DEFAULT 1,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_programs_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contenu d'un programme : exercices par semaine (visible après achat)
CREATE TABLE program_exercises (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  program_id   INT UNSIGNED NOT NULL,
  week_number  TINYINT UNSIGNED NOT NULL DEFAULT 1,
  position     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  name         VARCHAR(150) NOT NULL,
  instructions TEXT NULL,
  sets         TINYINT UNSIGNED NULL,
  reps         VARCHAR(30)  NULL,                   -- "12", "30 s", "8 par côté"
  rest_seconds SMALLINT UNSIGNED NULL,
  video_url    VARCHAR(255) NULL,
  KEY idx_ex_program (program_id, week_number, position),
  CONSTRAINT fk_ex_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exercices cochés par chaque patient (progression synchronisée entre appareils)
CREATE TABLE program_progress (
  user_id     INT UNSIGNED NOT NULL,
  exercise_id INT UNSIGNED NOT NULL,
  done_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, exercise_id),
  CONSTRAINT fk_prog_user     FOREIGN KEY (user_id)     REFERENCES users(id)             ON DELETE CASCADE,
  CONSTRAINT fk_prog_exercise FOREIGN KEY (exercise_id) REFERENCES program_exercises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Commandes (paiement Stripe Checkout) et factures
-- Les commandes sont conservées 10 ans (obligation comptable) même si le
-- compte client est supprimé : on garde une copie du nom / e-mail de facturation.
-- ---------------------------------------------------------
CREATE TABLE orders (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id               INT UNSIGNED NULL,
  program_id            INT UNSIGNED NOT NULL,
  program_title         VARCHAR(150) NOT NULL,          -- copie au moment de l'achat
  billing_name          VARCHAR(170) NOT NULL,
  billing_email         VARCHAR(190) NOT NULL,
  amount_cents          INT UNSIGNED NOT NULL,          -- TTC
  vat_rate_bp           SMALLINT UNSIGNED NOT NULL DEFAULT 0, -- taux de TVA en points de base (2000 = 20 %)
  status                ENUM('pending','paid','cancelled','refunded') NOT NULL DEFAULT 'pending',
  cgv_accepted_at       DATETIME NOT NULL,
  waiver_accepted_at    DATETIME NOT NULL,              -- renonciation au droit de rétractation (contenu numérique)
  stripe_session_id     VARCHAR(255) NULL,
  stripe_payment_intent VARCHAR(255) NULL,
  invoice_number        VARCHAR(20) NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at               DATETIME NULL,
  UNIQUE KEY uq_orders_session (stripe_session_id),
  UNIQUE KEY uq_orders_invoice (invoice_number),
  KEY idx_orders_user (user_id, status),
  CONSTRAINT fk_orders_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE SET NULL,
  CONSTRAINT fk_orders_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Compteurs (numérotation continue des factures, sans trou)
CREATE TABLE counters (
  name  VARCHAR(40) NOT NULL PRIMARY KEY,
  value INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Rendez-vous au cabinet (en ligne, ou saisis par le kiné)
-- ---------------------------------------------------------
CREATE TABLE appointments (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          INT UNSIGNED NULL,
  type             ENUM('bilan','seance','suivi') NOT NULL DEFAULT 'bilan',
  source           ENUM('web','cabinet') NOT NULL DEFAULT 'web',
  first_name       VARCHAR(80)  NOT NULL,
  last_name        VARCHAR(80)  NOT NULL,
  email            VARCHAR(190) NULL,                 -- facultatif pour un RDV pris par téléphone
  phone            VARCHAR(30)  NOT NULL,
  birth_date       DATE NULL,
  has_prescription TINYINT(1) NOT NULL DEFAULT 0,    -- ordonnance médicale
  message          TEXT NULL,                          -- motif / douleur
  start_at         DATETIME NOT NULL,
  end_at           DATETIME NOT NULL,
  status           ENUM('confirme','annule','termine','absent') NOT NULL DEFAULT 'confirme',
  cancel_token     CHAR(48) NOT NULL,
  reminder_sent_at DATETIME NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Empêche deux RDV actifs sur le même créneau (un RDV annulé libère la place)
  slot_lock        DATETIME AS (IF(status = 'annule', NULL, start_at)) STORED,
  UNIQUE KEY uq_appt_slot (slot_lock),
  UNIQUE KEY uq_appt_token (cancel_token),
  KEY idx_appt_start (start_at),
  KEY idx_appt_user (user_id),
  CONSTRAINT fk_appt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Horaires d'ouverture (plusieurs plages par jour possibles)
-- weekday : 1 = lundi … 7 = dimanche
-- ---------------------------------------------------------
CREATE TABLE opening_hours (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  weekday    TINYINT UNSIGNED NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  KEY idx_oh_weekday (weekday)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fermetures : journées entières (congés) ou plage horaire bloquée
-- (start_time / end_time renseignés = seulement cette plage, chaque jour de la période)
CREATE TABLE closures (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  start_time TIME NULL,
  end_time   TIME NULL,
  reason     VARCHAR(150) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Sessions de connexion (gérée par express-mysql-session)
-- ---------------------------------------------------------
CREATE TABLE sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  expires    INT UNSIGNED NOT NULL,
  data       MEDIUMTEXT COLLATE utf8mb4_bin
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migrations déjà appliquées (voir src/migrate.js)
CREATE TABLE schema_migrations (
  name       VARCHAR(190) NOT NULL PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
