const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const { Pool } = require('pg')
const client = require('prom-client')

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET manquant — configurez votre fichier .env')
}

const app = express()
app.use(express.json())

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

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

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType)
  res.end(await client.register.metrics())
})

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const result = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    )
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' })
    const user = result.rows[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
    const token = jwt.sign(
      { userId: user.id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )
    res.json({ token, user: { id: user.id, email, role: user.role } })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur interne du serveur' })
  }
})
app.post('/auth/verify', (req, res) => {
  const { token } = req.body
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    res.json({ valid: true, user: decoded })
  } catch (e) {
    res.status(401).json({ valid: false })
  }
})

if (require.main === module) {
   const PORT = process.env.PORT || 3001
   app.listen(PORT, () => {
     console.log(`Auth service running on :${PORT}`)
   })
}

module.exports = app
