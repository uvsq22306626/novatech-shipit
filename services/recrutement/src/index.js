const express = require('express')
const multer = require('multer')
const client = require('prom-client')
const { Pool } = require('pg')
const app = express()
app.use(express.json())
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

client.collectDefaultMetrics()

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP en secondes',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
})

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requêtes HTTP',
  labelNames: ['method', 'route', 'status'],
})

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer()
  res.on('finish', () => {
    const labels = { method: req.method, route: req.path, status: res.statusCode }
    end(labels)
    httpRequestTotal.inc(labels)
  })
  next()
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'recrutement' })
})

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType)
  res.end(await client.register.metrics())
})

/* istanbul ignore next */
if (process.env.MOCK_DB === 'true') {
  pool.query = async (sql, params) => {
    if (sql.startsWith('INSERT INTO candidats')) {
      return {
        rows: [{
          id: 1,
          nom: params[0],
          prenom: params[1],
          email: params[2],
          poste: params[3],
          cv_path: params[4] || '/tmp/uploads/cv.pdf',
          created_at: new Date()
        }]
      }
    }
    if (sql.startsWith('SELECT')) {
      return {
        rows: [
          { id: 1, nom: 'Alice', prenom: 'Dupont', email: 'alice@test.com', poste: 'Dev', statut: 'en attente' },
          { id: 2, nom: 'Bob', prenom: 'Martin', email: 'bob@test.com', poste: 'QA', statut: 'validé' }
        ]
      }
    }
    if (sql.startsWith('UPDATE')) {
      return { rows: [{ id: params[1], statut: params[0] }] }
    }
    return { rows: [] }
  }
}

const storage = multer.diskStorage({
  destination: '/tmp/uploads/',
  filename: (req, file, cb) => { cb(null, file.originalname) }
})
const upload = multer({ storage })

app.post('/recrutement/candidat', upload.single('cv'), async (req, res) => {
  const { nom, prenom, email, poste } = req.body

  if (!nom || !prenom || !email || !poste) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' })
  }

  if (!req.file) {
    return res.status(400).json({ error: 'CV manquant' })
  }

  try {
    const result = await pool.query(
      'INSERT INTO candidats (nom, prenom, email, poste, cv_path, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
      [nom, prenom, email, poste, req.file.path]
    )
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/recrutement/candidats', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM candidats ORDER BY created_at DESC')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/recrutement/candidat/:id/statut', async (req, res) => {
  const { id } = req.params
  const { statut } = req.body

  if (!statut || statut.trim() === '') {
    return res.status(400).json({ error: 'Statut invalide' })
  }

  try {
    const result = await pool.query(
      'UPDATE candidats SET statut = $1 WHERE id = $2 RETURNING *',
      [statut, id]
    )

    const rows = result.rows || []

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Candidature introuvable' })
    }

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = app

if (require.main === module) {
  const PORT = process.env.PORT || 3004
  app.listen(PORT, () => console.log(`Recrutement service running on :${PORT}`))
}
