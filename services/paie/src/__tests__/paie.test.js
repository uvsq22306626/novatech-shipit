jest.mock('pg', () => {
  const query = jest.fn()
  const Pool = jest.fn(() => ({ query, on: jest.fn() }))
  Pool.__query = query
  return { Pool }
})

jest.mock('axios', () => ({ post: jest.fn() }))

jest.mock('prom-client', () => ({
  collectDefaultMetrics: jest.fn(),
  Histogram: jest.fn(() => ({ startTimer: jest.fn(() => jest.fn()) })),
  Counter: jest.fn(() => ({ inc: jest.fn() })),
  register: { contentType: 'text/plain', metrics: jest.fn().mockResolvedValue('paie_requests_total 0') },
}))

process.env.MIGRATION_ADMIN_KEY = 'test-admin-key-123'
process.env.STRIPE_SECRET_KEY = 'sk_test_fake'

const request = require('supertest')
const { Pool } = require('pg')
const axios = require('axios')
const app = require('../index')

const mockQuery = Pool.__query

beforeEach(() => {
  jest.clearAllMocks()
})

// ── GET /health ────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('retourne status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', service: 'paie' })
  })
})

// ── GET /metrics ───────────────────────────────────────────────────────────────

describe('GET /metrics', () => {
  test('retourne les métriques prom-client', async () => {
    const res = await request(app).get('/metrics')
    expect(res.status).toBe(200)
    expect(res.text).toContain('paie_requests_total')
  })
})

// ── POST /paie/calculer ────────────────────────────────────────────────────────

describe('POST /paie/calculer', () => {
  test('calcule le bulletin et le persiste en base', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ salaire_mensuel_brut: 3500 }] })
      .mockResolvedValueOnce({ rows: [] })
    axios.post.mockResolvedValueOnce({ data: {} })

    const res = await request(app)
      .post('/paie/calculer')
      .send({ employeeId: 1, mois: 8, annee: 2026 })

    expect(res.status).toBe(200)
    expect(res.body.brut).toBe(3500)
    expect(res.body.cotisationsSalariales).toBeCloseTo(770)
    expect(res.body.net).toBeCloseTo(2730)
    expect(mockQuery).toHaveBeenCalledTimes(2)
  })

  test('retourne 404 si employé inconnu', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await request(app)
      .post('/paie/calculer')
      .send({ employeeId: 999, mois: 8, annee: 2026 })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Employee not found')
  })

  test('continue si Stripe échoue (erreur ignorée)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ salaire_mensuel_brut: 4000 }] })
      .mockResolvedValueOnce({ rows: [] })
    axios.post.mockRejectedValueOnce(new Error('Stripe timeout'))

    const res = await request(app)
      .post('/paie/calculer')
      .send({ employeeId: 2, mois: 8, annee: 2026 })

    expect(res.status).toBe(200)
    expect(res.body.net).toBeCloseTo(3120)
  })

  test('retourne 500 si erreur base de données', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost'))

    const res = await request(app)
      .post('/paie/calculer')
      .send({ employeeId: 1, mois: 8, annee: 2026 })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('DB connection lost')
  })
})

// ── POST /paie/heures-sup ──────────────────────────────────────────────────────

describe('POST /paie/heures-sup', () => {
  test('calcule la majoration 25%', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ salaire_mensuel_brut: 3000 }] })

    const res = await request(app)
      .post('/paie/heures-sup')
      .send({ employeeId: 1, heures: 10 })

    expect(res.status).toBe(200)
    expect(res.body.heures).toBe(10)
    expect(res.body.majorationHeuresSup).toBeCloseTo(10 * (3000 / 151.67) * 1.25)
    expect(res.body.total).toBe(res.body.majorationHeuresSup)
  })

  test('retourne 404 si employé inconnu', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await request(app)
      .post('/paie/heures-sup')
      .send({ employeeId: 999, heures: 5 })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Employee not found')
  })

  test('retourne 500 si erreur base de données', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'))

    const res = await request(app)
      .post('/paie/heures-sup')
      .send({ employeeId: 1, heures: 5 })

    expect(res.status).toBe(500)
  })
})

// ── POST /paie/migrate ─────────────────────────────────────────────────────────

describe('POST /paie/migrate', () => {
  test('refuse sans adminKey (403)', async () => {
    const res = await request(app)
      .post('/paie/migrate')
      .send({})

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/)
  })

  test('refuse avec mauvaise adminKey (403)', async () => {
    const res = await request(app)
      .post('/paie/migrate')
      .send({ adminKey: 'wrong-key' })

    expect(res.status).toBe(403)
  })

  test('exécute la migration avec la bonne clé (200)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const res = await request(app)
      .post('/paie/migrate')
      .send({ adminKey: 'test-admin-key-123' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  test('retourne 500 si la migration échoue', async () => {
    mockQuery.mockRejectedValueOnce(new Error('ALTER TABLE failed'))

    const res = await request(app)
      .post('/paie/migrate')
      .send({ adminKey: 'test-admin-key-123' })

    expect(res.status).toBe(500)
    expect(res.body.error).toContain('ALTER TABLE failed')
  })
})
