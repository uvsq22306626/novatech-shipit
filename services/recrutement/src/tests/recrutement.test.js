jest.mock('pg', () => {
  const mQuery = jest.fn()
  return { Pool: jest.fn(() => ({ query: mQuery })) }
})

const request = require('supertest')
const { Pool } = require('pg')
const app = require('../index')

const pool = new Pool()

describe('POST /recrutement/candidat', () => {
  beforeEach(() => jest.clearAllMocks())

  test('crée une candidature valide', async () => {
    pool.query.mockResolvedValue({
      rows: [{
        id: 1,
        nom: 'Alice',
        prenom: 'Dupont',
        email: 'alice@test.com',
        poste: 'Dev',
        cv_path: '/tmp/uploads/cv.pdf'
      }]
    })

    const res = await request(app)
      .post('/recrutement/candidat')
      .field('nom', 'Alice')
      .field('prenom', 'Dupont')
      .field('email', 'alice@test.com')
      .field('poste', 'Dev')
      .attach('cv', Buffer.from('fake pdf content'), 'cv.pdf')

    expect(res.status).toBe(200)
    expect(res.body.email).toBe('alice@test.com')
  })
})

describe('GET /recrutement/candidats', () => {
  beforeEach(() => jest.clearAllMocks())

  test('retourne la liste des candidatures', async () => {
    pool.query.mockResolvedValue({
      rows: [
        { id: 1, nom: 'Alice', email: 'alice@test.com' },
        { id: 2, nom: 'Bob', email: 'bob@test.com' }
      ]
    })

    const res = await request(app).get('/recrutement/candidats')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })
})

describe('PATCH /recrutement/candidat/:id/statut', () => {
  beforeEach(() => jest.clearAllMocks())

  test('met à jour le statut', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 1, statut: 'validé' }]
    })

    const res = await request(app)
      .patch('/recrutement/candidat/1/statut')
      .send({ statut: 'validé' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

test('refuse une candidature sans email', async () => {
  const res = await request(app)
    .post('/recrutement/candidat')
    .field('nom', 'Alice')
    .field('prenom', 'Dupont')
    .field('poste', 'Dev')
    .attach('cv', Buffer.from('fake pdf content'), 'cv.pdf')

  expect(res.status).toBe(400)
  expect(res.body).toEqual({ error: 'Champs obligatoires manquants' })
})

test('refuse une mise à jour avec statut vide', async () => {
  const res = await request(app)
    .patch('/recrutement/candidat/1/statut')
    .send({ statut: '' })

  expect(res.status).toBe(400)
  expect(res.body).toEqual({ error: 'Statut invalide' })
})

test('retourne 500 si la DB échoue lors de la création', async () => {
  pool.query.mockRejectedValue(new Error('DB error'))

  const res = await request(app)
    .post('/recrutement/candidat')
    .field('nom', 'Alice')
    .field('prenom', 'Dupont')
    .field('email', 'alice@test.com')
    .field('poste', 'Dev')
    .attach('cv', Buffer.from('fake pdf content'), 'cv.pdf')

  expect(res.status).toBe(500)
  expect(res.body).toEqual({ error: 'DB error' })
})

test('refuse une candidature sans CV', async () => {
  const res = await request(app)
    .post('/recrutement/candidat')
    .field('nom', 'Alice')
    .field('prenom', 'Dupont')
    .field('email', 'alice@test.com')
    .field('poste', 'Dev')

  expect(res.status).toBe(400)
  expect(res.body).toEqual({ error: 'CV manquant' })
})

test('retourne 500 si la DB échoue lors du GET', async () => {
  pool.query.mockRejectedValue(new Error('DB error'))

  const res = await request(app).get('/recrutement/candidats')

  expect(res.status).toBe(500)
  expect(res.body).toEqual({ error: 'DB error' })
})

test('retourne 500 si la DB échoue lors du PATCH', async () => {
  pool.query.mockRejectedValue(new Error('DB error'))

  const res = await request(app)
    .patch('/recrutement/candidat/1/statut')
    .send({ statut: 'validé' })

  expect(res.status).toBe(500)
  expect(res.body).toEqual({ error: 'DB error' })
})

test('retourne 404 si la candidature n’existe pas', async () => {
  pool.query.mockResolvedValue({ rows: [] })

  const res = await request(app)
    .patch('/recrutement/candidat/1/statut')
    .send({ statut: 'validé' })

  expect(res.status).toBe(404)
  expect(res.body).toEqual({ error: 'Candidature introuvable' })
})

test('GET /metrics fonctionne', async () => {
  const res = await request(app).get('/metrics')
  expect(res.status).toBe(200)
})
