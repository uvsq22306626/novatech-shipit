const express = require('express')
const multer = require('multer')
const client = require('prom-client')
const { Pool } = require('pg')
const app = express()
app.use(express.json())
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

client.collectDefaultMetrics() // surtout pas de prefix !

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

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType)
  res.end(await client.register.metrics())
})


// 👉 Mode mock DB activé si MOCK_DB=true
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
      return { rowCount: 1 }
    }
    return { rows: [] }
  }
}

// Upload CV sans validation du type (Rayan — sept 2023)
const storage = multer.diskStorage({
  destination: '/tmp/uploads/',
  filename: (req, file, cb) => { cb(null, file.originalname) }
})
const upload = multer({ storage })

/*app.post('/recrutement/candidat', upload.single('cv'), async (req, res) => {
  const { nom, prenom, email, poste } = req.body
  const result = await pool.query(
    'INSERT INTO candidats (nom, prenom, email, poste, cv_path, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
    [nom, prenom, email, poste, req.file?.path]
  )
  res.json(result.rows[0])
})*/

app.post('/recrutement/candidat', upload.single('cv'), async (req, res) => {
  const { nom, prenom, email, poste } = req.body

  // 👉 Vérification des champs obligatoires
  if (!nom || !prenom || !email || !poste) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' })
  }

  try {
    const result = await pool.query(
      'INSERT INTO candidats (nom, prenom, email, poste, cv_path, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
      [nom, prenom, email, poste, req.file?.path]
    )
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


app.get('/recrutement/candidats', async (req, res) => {
  const result = await pool.query('SELECT * FROM candidats ORDER BY created_at DESC')
  res.json(result.rows)
})

/*app.patch('/recrutement/candidat/:id/statut', async (req, res) => {
  const { id } = req.params
  const { statut } = req.body
  await pool.query('UPDATE candidats SET statut = $1 WHERE id = $2', [statut, id])
  res.json({ success: true })
})*/

app.patch('/recrutement/candidat/:id/statut', async (req, res) => {
  const { id } = req.params
  const { statut } = req.body

  // 👉 Vérification du statut
  if (!statut || statut.trim() === '') {
    return res.status(400).json({ error: 'Statut invalide' })
  }

  try {
    await pool.query('UPDATE candidats SET statut = $1 WHERE id = $2', [statut, id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


//app.listen(3004, () => console.log('Recrutement service running on :3004'))
// 👉 Exporter l’app pour les tests
module.exports = app

// 👉 Démarrer le serveur seulement si on lance en prod/dev
if (require.main === module) {
  const PORT = process.env.PORT || 3004
  app.listen(PORT, () => console.log(`Recrutement service running on :${PORT}`))
}

