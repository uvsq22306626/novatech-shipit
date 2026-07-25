// On simule (mock) les dépendances externes AVANT d'importer l'app
jest.mock('pg', () => {
  const mQuery = jest.fn()
  return { Pool: jest.fn(() => ({ query: mQuery })) }
})
jest.mock('bcrypt')

// JWT_SECRET doit exister sinon l'app refuse de démarrer
process.env.JWT_SECRET = 'test_secret_for_jest'

const request = require('supertest')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { Pool } = require('pg')
const app = require('../index')

// Récupère la fonction query simulée pour la piloter dans chaque test
const pool = new Pool()

describe('POST /auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('retourne un token quand les identifiants sont valides', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 1, email: 'user@test.com', role: 'admin', password_hash: 'hash' }]
    })
    bcrypt.compare.mockResolvedValue(true)

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'bonMotDePasse' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.email).toBe('user@test.com')
  })

  test('retourne 401 quand le mot de passe est incorrect', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 1, email: 'user@test.com', role: 'admin', password_hash: 'hash' }]
    })
    bcrypt.compare.mockResolvedValue(false)

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'mauvais' })

    expect(res.status).toBe(401)
    expect(res.body).not.toHaveProperty('token')
  })

  test('retourne 401 quand l email est inconnu', async () => {
    pool.query.mockResolvedValue({ rows: [] })

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'inconnu@test.com', password: 'peu importe' })

    expect(res.status).toBe(401)
  })
})

describe('POST /auth/verify', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('retourne valid:true pour un token valide', async () => {
    const token = jwt.sign({ userId: 1, role: 'admin' }, process.env.JWT_SECRET)

    const res = await request(app)
      .post('/auth/verify')
      .send({ token })

    expect(res.status).toBe(200)
    expect(res.body.valid).toBe(true)
    expect(res.body.user.userId).toBe(1)
  })

  test('retourne 401 pour un token invalide', async () => {
    const res = await request(app)
      .post('/auth/verify')
      .send({ token: 'ceci_est_un_faux_token' })

    expect(res.status).toBe(401)
    expect(res.body.valid).toBe(false)
  })
})
