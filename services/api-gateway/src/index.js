const express = require('express')
const { createProxyMiddleware } = require('http-proxy-middleware')
const authMiddleware = require('./middleware/auth')

const app = express()

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

app.use('/api/auth', createProxyMiddleware({ target: 'http://localhost:3001', changeOrigin: true }))

app.use('/api/paie', authMiddleware, createProxyMiddleware({ target: 'http://localhost:3002', changeOrigin: true }))
app.use('/api/conges', authMiddleware, createProxyMiddleware({ target: 'http://localhost:3003', changeOrigin: true }))
app.use('/api/recrutement', authMiddleware, createProxyMiddleware({ target: 'http://localhost:3004', changeOrigin: true }))

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Erreur intere du serveur' })
})

app.listen(3000, () => {
  console.log('API Gateway running on :3000')
})
