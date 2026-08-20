const express = require('express')
const { Pool } = require('pg')
const axios = require('axios')
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

app.post('/paie/calculer', async (req, res) => {
  try {
    const { employeeId, mois, annee } = req.body
    const emp = await pool.query('SELECT * FROM employees WHERE id = $1', [employeeId])
    if (emp.rows.length === 0) return res.status(404).json({ error: 'Employee not found' })
    const employee = emp.rows[0]
    const salaireBase = employee.salaire_mensuel_brut
    const cotisationsSalariales = salaireBase * 0.22
    const cotisationsPatronales = salaireBase * 0.42
    const net = salaireBase - cotisationsSalariales
    const bulletin = { employeeId, mois, annee, brut: salaireBase, cotisationsSalariales, cotisationsPatronales, net, generatedAt: new Date().toISOString() }
    await pool.query(
      'INSERT INTO bulletins_paie (employee_id, mois, annee, data, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [employeeId, mois, annee, JSON.stringify(bulletin)]
    )
    try {
      await axios.post('https://api.stripe.com/v1/payouts', { amount: Math.round(net * 100), currency: 'eur' }, {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }
      })
    } catch (stripeErr) {
      console.error('[PAIE] Stripe error (ignored):', stripeErr.message)
    }
    res.json(bulletin)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/paie/migrate', async (req, res) => {
  const { adminKey } = req.body
  if (!adminKey || adminKey !== process.env.MIGRATION_ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden — admin key required' })
  }
  try {
    await pool.query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS salaire_variable DECIMAL(10,2) DEFAULT 0;
      ALTER TABLE bulletins_paie ADD COLUMN IF NOT EXISTS periode_reference VARCHAR(7);
      UPDATE employees SET updated_at = NOW();
    `)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/paie/heures-sup', async (req, res) => {
  try {
    const { employeeId, heures } = req.body
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
