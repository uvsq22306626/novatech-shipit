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

process.env.STRIPE_SECRET_KEY = 'sk_test_fake'
process.env.JWT_SECRET = 'test-jwt-secret'

const request = require('supertest')
const jwt = require('jsonwebtoken')
const { Pool } = require('pg')
const axios = require('axios')
const app = require('../index')

const mockQuery = Pool.__query
const authHeader = () => `Bearer ${jwt.sign({ sub: 1, role: 'rh' }, process.env.JWT_SECRET)}`

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
  test('refuse sans token (401)', async () => {
    const res = await request(app)
      .post('/paie/calculer')
      .send({ employeeId: 1, mois: 8, annee: 2026 })

    expect(res.status).toBe(401)
  })

  test('refuse avec un token invalide (401)', async () => {
    const res = await request(app)
      .post('/paie/calculer')
      .set('Authorization', 'Bearer invalid-token')
      .send({ employeeId: 1, mois: 8, annee: 2026 })

    expect(res.status).toBe(401)
  })

  test('refuse un employeeId invalide (400)', async () => {
    const res = await request(app)
      .post('/paie/calculer')
      .set('Authorization', authHeader())
      .send({ employeeId: -1, mois: 8, annee: 2026 })

    expect(res.status).toBe(400)
  })

  test('refuse un mois/annee invalide (400)', async () => {
    const res = await request(app)
      .post('/paie/calculer')
      .set('Authorization', authHeader())
      .send({ employeeId: 1, mois: 13, annee: 2026 })

    expect(res.status).toBe(400)
  })

  test('calcule le bulletin et le persiste en base', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // pas de bulletin existant
      .mockResolvedValueOnce({ rows: [{ salaire_mensuel_brut: 3500 }] }) // employé
      .mockResolvedValueOnce({ rows: [] }) // insert

    axios.post.mockResolvedValueOnce({ data: {} })

    const res = await request(app)
      .post('/paie/calculer')
      .set('Authorization', authHeader())
      .send({ employeeId: 1, mois: 8, annee: 2026 })

    expect(res.status).toBe(200)
    expect(res.body.brut).toBe(3500)
    expect(res.body.cotisationsSalariales).toBeCloseTo(770)
    expect(res.body.net).toBeCloseTo(2730)
    expect(res.body.virementStatut).toBe('reussi')
    expect(mockQuery).toHaveBeenCalledTimes(3)
  })

  test('retourne 409 si un bulletin existe déjà pour cette période', async () => {
    const bulletinExistant = { employeeId: 1, mois: 8, annee: 2026, net: 2730 }
    mockQuery.mockResolvedValueOnce({ rows: [{ data: bulletinExistant }] })

    const res = await request(app)
      .post('/paie/calculer')
      .set('Authorization', authHeader())
      .send({ employeeId: 1, mois: 8, annee: 2026 })

    expect(res.status).toBe(409)
    expect(res.body.bulletin).toEqual(bulletinExistant)
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('retourne 404 si employé inconnu', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // pas de bulletin existant
      .mockResolvedValueOnce({ rows: [] }) // employé introuvable

    const res = await request(app)
      .post('/paie/calculer')
      .set('Authorization', authHeader())
      .send({ employeeId: 999, mois: 8, annee: 2026 })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Employee not found')
  })

  test('si Stripe échoue, le bulletin est quand même persisté mais renvoyé en erreur (502)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // pas de bulletin existant
      .mockResolvedValueOnce({ rows: [{ salaire_mensuel_brut: 4000 }] }) // employé
      .mockResolvedValueOnce({ rows: [] }) // insert

    axios.post.mockRejectedValueOnce(new Error('Stripe timeout'))

    const res = await request(app)
      .post('/paie/calculer')
      .set('Authorization', authHeader())
      .send({ employeeId: 2, mois: 8, annee: 2026 })

    expect(res.status).toBe(502)
    expect(res.body.net).toBeCloseTo(3120)
    expect(res.body.virementStatut).toBe('echoue')
    expect(res.body.virementErreur).toBe('Stripe timeout')
    expect(mockQuery).toHaveBeenCalledTimes(3)
  })

  test('retourne 500 si erreur base de données', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost'))

    const res = await request(app)
      .post('/paie/calculer')
      .set('Authorization', authHeader())
      .send({ employeeId: 1, mois: 8, annee: 2026 })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('DB connection lost')
  })
})

// ── POST /paie/heures-sup ──────────────────────────────────────────────────────

describe('POST /paie/heures-sup', () => {
  test('refuse sans token (401)', async () => {
    const res = await request(app)
      .post('/paie/heures-sup')
      .send({ employeeId: 1, heures: 10 })

    expect(res.status).toBe(401)
  })

  test('refuse des heures invalides (400)', async () => {
    const res = await request(app)
      .post('/paie/heures-sup')
      .set('Authorization', authHeader())
      .send({ employeeId: 1, heures: -5 })

    expect(res.status).toBe(400)
  })

  test('calcule la majoration 25%', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ salaire_mensuel_brut: 3000 }] })

    const res = await request(app)
      .post('/paie/heures-sup')
      .set('Authorization', authHeader())
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
      .set('Authorization', authHeader())
      .send({ employeeId: 999, heures: 5 })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Employee not found')
  })

  test('retourne 500 si erreur base de données', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'))

    const res = await request(app)
      .post('/paie/heures-sup')
      .set('Authorization', authHeader())
      .send({ employeeId: 1, heures: 5 })

    expect(res.status).toBe(500)
  })
})

// ── POST /paie/migrate ─────────────────────────────────────────────────────────
// Route retirée : voir docs/incident-aout-2024.md et docs/runbook-incident-p1.md.

describe('POST /paie/migrate', () => {
  test("n'existe plus (404)", async () => {
    const res = await request(app)
      .post('/paie/migrate')
      .send({ adminKey: 'test-admin-key-123' })

    expect(res.status).toBe(404)
  })
})
