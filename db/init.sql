-- Schéma d'initialisation HRFlow pour l'environnement Docker Compose local.
-- Ce fichier n'existait pas dans le repo : les tables ci-dessous sont déduites
-- des requêtes SQL trouvées dans services/{auth,paie,conges,recrutement}/src/index.js.
-- Exécuté automatiquement par l'image postgres au premier démarrage du volume
-- (docker-entrypoint-initdb.d).

-- Utilisée par services/auth (SELECT * FROM users WHERE email = $1)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'employee',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Utilisée par services/paie (salaire_mensuel_brut) et services/conges (jours_conges_acquis)
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(255),
  prenom VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  salaire_mensuel_brut DECIMAL(10,2) NOT NULL DEFAULT 0,
  salaire_variable DECIMAL(10,2) DEFAULT 0,
  jours_conges_acquis INTEGER NOT NULL DEFAULT 25,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Utilisée par services/paie (POST /paie/calculer)
CREATE TABLE IF NOT EXISTS bulletins_paie (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  mois INTEGER NOT NULL,
  annee INTEGER NOT NULL,
  data JSONB NOT NULL,
  periode_reference VARCHAR(7),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Utilisée par services/conges (POST /conges/demande, GET /conges/solde/:id)
CREATE TABLE IF NOT EXISTS conges (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  nombre_jours INTEGER NOT NULL,
  motif TEXT,
  statut VARCHAR(50) NOT NULL DEFAULT 'en_attente',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Utilisée par services/recrutement (POST /recrutement/candidat, GET /recrutement/candidats)
CREATE TABLE IF NOT EXISTS candidats (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(255),
  prenom VARCHAR(255),
  email VARCHAR(255),
  poste VARCHAR(255),
  cv_path TEXT,
  statut VARCHAR(50) DEFAULT 'en attente',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Données de test minimales pour vérifier le bon fonctionnement en local.
-- password_hash correspond au mot de passe "Passw0rd!" (bcrypt).
INSERT INTO users (email, password_hash, role)
VALUES ('admin@example.com', '$2b$10$MJMPNcoWCdqRvuVw4S3vq.DBUGoEQwSRQ9gWAzE8gVVEnwjf07GzC', 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO employees (nom, prenom, email, salaire_mensuel_brut, jours_conges_acquis)
VALUES ('Dupont', 'Jean', 'jean.dupont@example.com', 3000, 25)
ON CONFLICT (email) DO NOTHING;
