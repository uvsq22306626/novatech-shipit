const express = require('express')
const { Pool } = require('pg')
const unleash = require('./config/unleash')
const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')
const path = require('path')
const client = require('prom-client')

const app = express()

const swaggerDocument = YAML.load(
  path.join(__dirname, 'docs', 'openapi.yaml')
)

client.collectDefaultMetrics()

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP en secondes',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5]
})

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requêtes HTTP',
  labelNames: ['method', 'route', 'status']
})

app.use(express.json())

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer()
  res.on('finish', () => {
    const labels = {
      method: req.method,
      route: req.path,
      status: res.statusCode
    }
    end(labels)
    httpRequestTotal.inc(labels)
  })
  next()
})

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

// Documentation Swagger
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument)
)

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'conges'
  })
})

// Métriques Prometheus
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType)
  res.end(await client.register.metrics())
})

// Consulter le solde de congés d'un employé
app.get('/conges/solde/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params

    const employee = await pool.query(
      'SELECT * FROM employees WHERE id = $1',
      [employeeId]
    )

    if (employee.rows.length === 0) {
      return res.status(404).json({
        error: 'Employé introuvable'
      })
    }

    const congesPris = await pool.query(
      'SELECT * FROM conges WHERE employee_id = $1 AND statut = $2',
      [employeeId, 'approuve']
    )

    const congesEnAttente = await pool.query(
      'SELECT * FROM conges WHERE employee_id = $1 AND statut = $2',
      [employeeId, 'en_attente']
    )

    const joursAcquis =
      employee.rows[0].jours_conges_acquis || 25

    const joursPris = congesPris.rows.reduce(
      (acc, conge) => acc + conge.nombre_jours,
      0
    )

    const joursEnAttente = congesEnAttente.rows.reduce(
      (acc, conge) => acc + conge.nombre_jours,
      0
    )

    return res.json({
      solde: joursAcquis - joursPris,
      joursAcquis,
      joursPris,
      joursEnAttente
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erreur interne du serveur'
    })
  }
})

// Créer une demande de congé
app.post('/conges/demande', async (req, res) => {
  try {
    const {
      employeeId,
      dateDebut,
      dateFin,
      motif
    } = req.body

    // Vérification des champs obligatoires
    if (!employeeId || !dateDebut || !dateFin || !motif) {
      return res.status(400).json({
        error:
          'employeeId, dateDebut, dateFin et motif sont obligatoires'
      })
    }

    const debut = new Date(dateDebut)
    const fin = new Date(dateFin)

    // Vérification du format des dates
    if (
      Number.isNaN(debut.getTime()) ||
      Number.isNaN(fin.getTime())
    ) {
      return res.status(400).json({
        error: 'Les dates sont invalides'
      })
    }

    // La date de fin ne peut pas précéder la date de début
    if (fin < debut) {
      return res.status(400).json({
        error:
          'La date de fin doit être supérieure ou égale à la date de début'
      })
    }

    // +1 pour compter également le premier jour
    const nombreJours =
      Math.floor(
        (fin.getTime() - debut.getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1

    /*
     * Feature Flag :
     * OFF -> demande en attente
     * ON + congé <= 3 jours -> approbation automatique
     */
    const automaticApprovalEnabled = unleash.isEnabled(
      'conges-automatic-approval',
      {},
      false
    )

    let statut = 'en_attente'

    if (automaticApprovalEnabled && nombreJours <= 3) {
      statut = 'approuve'
    }

    console.log(
      `[Congés] Feature flag automatic approval: ${
        automaticApprovalEnabled ? 'ON' : 'OFF'
      }`
    )

    console.log(
      `[Congés] Demande de ${nombreJours} jour(s) -> ${statut}`
    )

    const result = await pool.query(
      `INSERT INTO conges
       (
         employee_id,
         date_debut,
         date_fin,
         nombre_jours,
         motif,
         statut,
         created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [
        employeeId,
        dateDebut,
        dateFin,
        nombreJours,
        motif,
        statut
      ]
    )

    return res.status(201).json(result.rows[0])
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Erreur interne du serveur'
    })
  }
})

module.exports = {
  app,
  pool
}
