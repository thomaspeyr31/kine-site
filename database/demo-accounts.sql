-- =========================================================
--  Comptes de démonstration — DÉVELOPPEMENT UNIQUEMENT
--  Insérés par "npm run db:init" (jamais en production).
--    Kiné (admin) : kine@cabinet.fr   / MotDePasse123
--    Patient      : patient@test.fr   / patient1234
-- =========================================================
SET NAMES utf8mb4;

INSERT INTO users (first_name, last_name, email, phone, password_hash, role) VALUES
('Camille', 'Martin', 'kine@cabinet.fr', '05 00 00 00 00', '$2b$12$GaX7u2BCbGbcOtnt.j2aDeal/5TmPNGTD6HDC8i3WxwUvc4Wpl1jG', 'admin'),
('Léa', 'Durand', 'patient@test.fr', '06 12 34 56 78', '$2b$12$ztuJ3AQWTzAFYLvkkmEGAOoANHEkTrzuDrRViMCSUsHebT9lvgM6G', 'client');
