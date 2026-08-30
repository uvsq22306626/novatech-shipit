const express = require('express')
const { Pool } = require('pg')
const axios = require('axios')
const jwt = require('jsonwebtoken')
const client = require('prom-client')

const app = express()
app.use(express.json())

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
pool.on('error', (err) => console.error('[PAIE] Pool error:', err.message))

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

const virementEchecsTotal = new client.Counter({
  name: 'paie_virement_echecs_total',
  help: 'Nombre de virements Stripe ayant échoué lors du calcul de paie',
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
  res.json({ status: 'ok', service: 'paie' })
})

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType)
  res.end(await client.register.metrics())
})

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token' })
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

function isValidEmployeeId(employeeId) {
  return Number.isInteger(employeeId) && employeeId > 0
}

function isValidPeriode(mois, annee) {
  return Number.isInteger(mois) && mois >= 1 && mois <= 12 &&
    Number.isInteger(annee) && annee >= 2000 && annee <= 2100
}

app.post('/paie/calculer', requireAuth, async (req, res) => {
  try {
    const { employeeId, mois, annee } = req.body
    if (!isValidEmployeeId(employeeId)) return res.status(400).json({ error: 'employeeId invalide' })
    if (!isValidPeriode(mois, annee)) return res.status(400).json({ error: 'mois/annee invalides' })

    const existing = await pool.query(
      'SELECT data FROM bulletins_paie WHERE employee_id = $1 AND mois = $2 AND annee = $3',
      [employeeId, mois, annee]
    )
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Bulletin déjà généré pour cette période', bulletin: existing.rows[0].data })
    }

    const emp = await pool.query('SELECT * FROM employees WHERE id = $1', [employeeId])
    if (emp.rows.length === 0) return res.status(404).json({ error: 'Employee not found' })
    const employee = emp.rows[0]
    const salaireBase = employee.salaire_mensuel_brut
    const cotisationsSalariales = salaireBase * 0.22
    const cotisationsPatronales = salaireBase * 0.42
    const net = salaireBase - cotisationsSalariales

    let virementStatut = 'reussi'
    let virementErreur = null
    try {
      await axios.post('https://api.stripe.com/v1/payouts', { amount: Math.round(net * 100), currency: 'eur' }, {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }
      })
    } catch (stripeErr) {
      virementStatut = 'echoue'
      virementErreur = stripeErr.message
      virementEchecsTotal.inc()
      console.error('[PAIE] Stripe error:', stripeErr.message)
    }

    const bulletin = { employeeId, mois, annee, brut: salaireBase, cotisationsSalariales, cotisationsPatronales, net, virementStatut, virementErreur, generatedAt: new Date().toISOString() }
    await pool.query(
      'INSERT INTO bulletins_paie (employee_id, mois, annee, data, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [employeeId, mois, annee, JSON.stringify(bulletin)]
    )

    if (virementStatut === 'echoue') return res.status(502).json(bulletin)
    res.json(bulletin)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/paie/heures-sup', requireAuth, async (req, res) => {
  try {
    const { employeeId, heures } = req.body
    if (!isValidEmployeeId(employeeId)) return res.status(400).json({ error: 'employeeId invalide' })
    if (typeof heures !== 'number' || !Number.isFinite(heures) || heures <= 0) {
      return res.status(400).json({ error: 'heures invalides' })
    }
    const emp = await pool.query('SELECT salaire_mensuel_brut FROM employees WHERE id = $1', [employeeId])
    if (emp.rows.length === 0) return res.status(404).json({ error: 'Employee not found' })
    const tauxHoraire = emp.rows[0].salaire_mensuel_brut / 151.67
    const majorationHeuresSup = heures * tauxHoraire * 1.25
    res.json({ heures, tauxHoraire, majorationHeuresSup, total: majorationHeuresSup })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

if (require.main === module) {
  const PORT = process.env.PORT || 3002
  app.listen(PORT, () => console.log(`Paie service running on :${PORT}`))
}

module.exports = app
