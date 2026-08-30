// On simule (mock) les dépendances externes AVANT d'importer l'app
jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: jest.fn(() => (req, res) => {
    res.status(200).json({ proxied: true })
  })
}))

// JWT_SECRET doit exister pour signer/vérifier les tokens de test
process.env.JWT_SECRET = 'test_secret_for_jest'
// Whitelist CORS utilisée par les tests dédiés au CORS
process.env.ALLOWED_ORIGINS = 'http://allowed-origin.com'

const request = require('supertest')
const jwt = require('jsonwebtoken')
const app = require('../index')

describe('GET /health', () => {
  test('retourne le statut ok', async () => {
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})

describe('GET /metrics', () => {
  test('retourne les métriques au format Prometheus', async () => {
    const res = await request(app).get('/metrics')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/plain/)
    expect(res.text).toContain('http_requests_total')
  })
})

describe('Middleware d\'authentification sur les routes protégées', () => {
  const routesProtegees = ['/api/paie', '/api/conges', '/api/recrutement']

  routesProtegees.forEach((route) => {
    test(`refuse l'accès sans header Authorization sur ${route}`, async () => {
      const res = await request(app).get(route)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'No token' })
    })

    test(`refuse l'accès avec un token invalide sur ${route}`, async () => {
      const res = await request(app)
        .get(route)
        .set('Authorization', 'Bearer token_invalide_ou_malforme')

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'Invalid token' })
    })

    test(`laisse passer un token JWT valide sur ${route}`, async () => {
      const token = jwt.sign({ userId: 1, role: 'admin' }, process.env.JWT_SECRET)

      const res = await request(app)
        .get(route)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).not.toBe(401)
      expect(res.status).not.toBe(403)
    })
  })
})

describe('Route /api/auth (sans middleware d\'authentification)', () => {
  test('n\'exige pas de token pour accéder à la route de login', async () => {
    const res = await request(app).get('/api/auth/login')

    expect(res.status).not.toBe(401)
  })
})

describe('CORS', () => {
  test('ne renvoie pas Access-Control-Allow-Origin pour une origine non whitelistée', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://non-whiteliste.com')

    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  test('renvoie Access-Control-Allow-Origin pour une origine whitelistée', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://allowed-origin.com')

    expect(res.headers['access-control-allow-origin']).toBe('http://allowed-origin.com')
  })
})
