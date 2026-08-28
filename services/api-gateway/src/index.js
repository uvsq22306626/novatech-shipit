const express = require('express')
const { createProxyMiddleware } = require('http-proxy-middleware')
const client = require('prom-client')
const authMiddleware = require('./middleware/auth')

const app = express()

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

// CORS ouvert pour le dev — à restreindre en prod (TODO)
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || []

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  next()
})

// URLs des services cibles — configurables par variable d'env (ex: réseau Docker Compose)
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001'
const PAIE_SERVICE_URL = process.env.PAIE_SERVICE_URL || 'http://localhost:3002'
const CONGES_SERVICE_URL = process.env.CONGES_SERVICE_URL || 'http://localhost:3003'
const RECRUTEMENT_SERVICE_URL = process.env.RECRUTEMENT_SERVICE_URL || 'http://localhost:3004'

app.use('/api/auth', createProxyMiddleware({ target: AUTH_SERVICE_URL, changeOrigin: true, pathRewrite: { '^/api/auth': '/auth' } }))

app.use('/api/paie', authMiddleware, createProxyMiddleware({ target: PAIE_SERVICE_URL, changeOrigin: true, pathRewrite: { '^/api/paie': '/paie' } }))
app.use('/api/conges', authMiddleware, createProxyMiddleware({ target: CONGES_SERVICE_URL, changeOrigin: true, pathRewrite: { '^/api/conges': '/conges' } }))
app.use('/api/recrutement', authMiddleware, createProxyMiddleware({ target: RECRUTEMENT_SERVICE_URL, changeOrigin: true, pathRewrite: { '^/api/recrutement': '/recrutement' } }))

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Erreur interne du serveur' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`API Gateway running on :${PORT}`)
})
