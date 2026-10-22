-- =========================================================
--  Données de démonstration (programmes + horaires)
--  À importer APRÈS schema.sql
-- =========================================================
SET NAMES utf8mb4;

INSERT INTO programs (id, slug, title, body_area, level, short_description, description, duration_weeks, sessions_per_week, price_cents, is_published) VALUES
(1, 'genou-retour-au-sport', 'Genou : retour au sport', 'Genou', 'intermediaire',
 'Renforcer quadriceps et ischios pour revenir au sport après une entorse ou une tendinopathie.',
 'Ce programme progressif accompagne la reprise après une entorse du genou, un syndrome rotulien ou une tendinopathie. Il commence par du renforcement isométrique sans douleur, puis introduit le travail excentrique, la proprioception et enfin les sauts et changements de direction.\n\nChaque semaine indique les séries, répétitions et temps de repos. La douleur pendant l''exercice doit rester inférieure à 3/10.',
 6, 3, 3900, 1),
(2, 'epaule-coiffe-des-rotateurs', 'Épaule stable : coiffe des rotateurs', 'Épaule', 'debutant',
 'Retrouver une épaule mobile et indolore grâce à un renforcement ciblé de la coiffe.',
 'Pour les douleurs d''épaule liées à la coiffe des rotateurs, au conflit sous-acromial ou après une période d''immobilisation. On travaille la mobilité, la stabilité de l''omoplate puis le renforcement en rotation externe et interne avec élastique.',
 6, 3, 3900, 1),
(3, 'dos-lombalgie', 'Dos fort : lombalgie', 'Dos', 'debutant',
 'Sortir du cercle de la lombalgie avec du gainage, de la mobilité et une reprise d''activité graduée.',
 'Programme conçu pour la lombalgie commune (sans signe neurologique). Il combine mobilité de la colonne, gainage progressif et renforcement des fessiers, avec un objectif clair : bouger à nouveau sans appréhension.\n\nUn avis médical est recommandé avant de commencer si la douleur descend sous le genou.',
 8, 3, 4900, 1),
(4, 'cheville-apres-entorse', 'Cheville : après entorse', 'Cheville', 'debutant',
 'Proprioception et renforcement pour éviter la récidive après une entorse de cheville.',
 'L''entorse de cheville récidive souvent faute de rééducation complète. Ce programme de 4 semaines travaille l''équilibre, le renforcement des fibulaires et le retour aux appuis dynamiques.',
 4, 4, 2900, 1),
(5, 'reprise-course-a-pied', 'Reprise de la course à pied', 'Membres inférieurs', 'intermediaire',
 'Un plan de 8 semaines pour reprendre la course sans se blesser, avec renforcement associé.',
 'Alternance marche-course progressive associée à deux séances de renforcement par semaine (mollets, quadriceps, fessiers, pied). Adapté après une blessure ou un long arrêt.',
 8, 3, 4500, 1),
(6, 'ischio-jambiers-prevention', 'Ischio-jambiers : prévention', 'Cuisse', 'avance',
 'Renforcement excentrique (Nordic, pont unipodal) pour les sportifs de sprint et de sports collectifs.',
 'Les lésions des ischio-jambiers sont fréquentes au football, rugby et en athlétisme. Ce protocole basé sur le Nordic hamstring et le travail en course longue réduit le risque de blessure.',
 4, 2, 2900, 1);

INSERT INTO program_exercises (program_id, week_number, position, name, instructions, sets, reps, rest_seconds) VALUES
-- Genou
(1,1,1,'Contraction isométrique du quadriceps','Assis, jambe tendue, serrer la cuisse en écrasant un coussin sous le genou. Tenir 10 s.',3,'10 × 10 s',30),
(1,1,2,'Chaise contre un mur','Dos au mur, genoux à 60°. Tenir sans douleur.',4,'30 s',60),
(1,1,3,'Pont fessier','Allongé, pieds au sol, monter le bassin et tenir 2 s en haut.',3,'12',45),
(1,2,1,'Squat partiel','Descendre jusqu''à 60° de flexion, poids réparti sur les deux jambes.',3,'12',60),
(1,2,2,'Montée de marche','Monter sur une marche de 20 cm en contrôlant le genou dans l''axe.',3,'10 par jambe',60),
(1,2,3,'Équilibre unipodal','Sur une jambe, genou légèrement fléchi. Fermer les yeux si trop facile.',3,'30 s par jambe',30),
(1,3,1,'Fente avant','Descente lente en 3 s, genou au-dessus du pied.',3,'10 par jambe',60),
(1,3,2,'Squat excentrique sur plan incliné','Descente sur 4 s sur une seule jambe, remontée à deux jambes.',3,'8 par jambe',90),
(1,4,1,'Squat bulgare','Pied arrière sur une chaise.',4,'8 par jambe',90),
(1,4,2,'Pas chassés latéraux avec élastique','Élastique au-dessus des genoux.',3,'15 pas',45),
(1,5,1,'Sauts sur place à deux pieds','Réception souple, genoux dans l''axe.',3,'20',60),
(1,5,2,'Saut en contrebas','Depuis une marche, réception stabilisée 2 s.',3,'6',90),
(1,6,1,'Changements de direction','Course en 8 autour de deux plots à vitesse progressive.',4,'30 s',90),
(1,6,2,'Sauts unipodaux avant','Sauter et tenir la réception 2 s.',3,'6 par jambe',90),
-- Épaule
(2,1,1,'Pendulaire de Codman','Penché en avant, laisser pendre le bras et faire de petits cercles.',2,'1 min',30),
(2,1,2,'Rétraction des omoplates','Serrer les omoplates vers l''arrière et le bas, tenir 5 s.',3,'10',30),
(2,2,1,'Rotation externe avec élastique','Coude au corps à 90°, tourner l''avant-bras vers l''extérieur.',3,'15',45),
(2,2,2,'Rotation interne avec élastique','Même position, vers l''intérieur.',3,'15',45),
(2,3,1,'Élévation dans le plan de l''omoplate','Bras à 30° en avant, pouce vers le haut, jusqu''à hauteur d''épaule.',3,'12',60),
(2,4,1,'Pompes contre un mur','Garder les omoplates plaquées.',3,'12',60),
(2,5,1,'Tirage horizontal élastique','Tirer vers la poitrine en serrant les omoplates.',3,'12',60),
(2,6,1,'Rotation externe à 90° d''abduction','Bras à hauteur d''épaule, coude à 90°.',3,'10',60),
-- Dos
(3,1,1,'Bascule du bassin','Allongé, creuser puis plaquer le bas du dos au sol.',2,'15',30),
(3,1,2,'Chat-vache','À quatre pattes, enrouler puis creuser le dos lentement.',2,'10',30),
(3,1,3,'Marche quotidienne','Marcher à allure confortable.',1,'20 min',NULL),
(3,2,1,'Gainage ventral sur genoux','Corps aligné des épaules aux genoux.',3,'20 s',40),
(3,2,2,'Bird-dog','Bras et jambe opposés tendus, bassin stable.',3,'8 par côté',40),
(3,3,1,'Pont fessier','Monter le bassin, serrer les fessiers 2 s.',3,'15',45),
(3,4,1,'Gainage ventral complet','Sur les orteils.',3,'30 s',45),
(3,5,1,'Soulevé de terre jambes tendues léger','Bâton ou kettlebell légère, dos droit.',3,'10',60),
(3,6,1,'Gainage latéral','Sur l''avant-bras.',3,'25 s par côté',45),
(3,7,1,'Squat goblet','Charge contre la poitrine.',3,'10',60),
(3,8,1,'Port de charge (farmer walk)','Charges dans chaque main, marcher droit.',3,'30 m',60),
-- Cheville
(4,1,1,'Alphabet avec le pied','Écrire l''alphabet avec le gros orteil.',2,'1 alphabet',30),
(4,1,2,'Équilibre unipodal au sol','Pied nu.',3,'30 s',30),
(4,2,1,'Éversion avec élastique','Tourner le pied vers l''extérieur contre l''élastique.',3,'15',45),
(4,2,2,'Montées sur pointes','Lentement, deux pieds puis un pied.',3,'15',45),
(4,3,1,'Équilibre sur coussin instable','Yeux ouverts puis fermés.',3,'30 s',30),
(4,4,1,'Sauts latéraux au-dessus d''une ligne','Réception sur l''avant du pied.',3,'20',60),
-- Course
(5,1,1,'Marche / course','1 min de course / 2 min de marche, 6 fois.',1,'18 min',NULL),
(5,1,2,'Montées sur pointes unipodales','Pour les mollets.',3,'15 par jambe',45),
(5,2,1,'Marche / course','2 min / 2 min, 5 fois.',1,'20 min',NULL),
(5,3,1,'Marche / course','3 min / 1 min, 5 fois.',1,'20 min',NULL),
(5,4,1,'Marche / course','5 min / 1 min, 4 fois.',1,'24 min',NULL),
(5,5,1,'Course continue','Allure facile, possibilité de parler.',1,'20 min',NULL),
(5,6,1,'Course continue','Allure facile.',1,'25 min',NULL),
(5,7,1,'Course continue','Allure facile.',1,'30 min',NULL),
(5,8,1,'Course continue + 4 accélérations','Accélérations de 20 s en fin de séance.',1,'35 min',NULL),
-- Ischios
(6,1,1,'Pont unipodal','Talon sur un banc.',3,'10 par jambe',60),
(6,1,2,'Nordic hamstring (assisté)','Descente lente, se rattraper avec les mains.',2,'5',120),
(6,2,1,'Nordic hamstring','Descente sur 4 s.',3,'6',120),
(6,3,1,'Soulevé de terre unipodal','Dos droit, bassin horizontal.',3,'8 par jambe',90),
(6,4,1,'Sprints progressifs','Accélérations sur 30 m à 70, 80 puis 90 %.',6,'30 m',120);

-- Horaires : lundi → vendredi 8h30-12h30 / 14h-19h, samedi 9h-12h
INSERT INTO opening_hours (weekday, start_time, end_time) VALUES
(1,'08:30','12:30'),(1,'14:00','19:00'),
(2,'08:30','12:30'),(2,'14:00','19:00'),
(3,'08:30','12:30'),(3,'14:00','19:00'),
(4,'08:30','12:30'),(4,'14:00','19:00'),
(5,'08:30','12:30'),(5,'14:00','19:00'),
(6,'09:00','12:00');
