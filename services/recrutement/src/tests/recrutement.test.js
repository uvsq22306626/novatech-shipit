// Mock de pg avant d'importer l'app
jest.mock('pg', () => {
  const mQuery = jest.fn()
  return { Pool: jest.fn(() => ({ query: mQuery })) }
})

const request = require('supertest')
const { Pool } = require('pg')
const app = require('../index')

// Récupère la fonction query simulée
const pool = new Pool()

describe('POST /recrutement/candidat', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

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
    expect(res.body.cv_path).toContain('cv.pdf')
  })
})

describe('GET /recrutement/candidats', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

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
    expect(res.body[0].nom).toBe('Alice')
  })
})

describe('PATCH /recrutement/candidat/:id/statut', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('met à jour le statut', async () => {
    pool.query.mockResolvedValue({})

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

  expect(res.status).toBe(400) // ou 422 si tu utilises Zod
  expect(res.body.error).toBeDefined()
})

test('refuse une mise à jour avec statut vide', async () => {
  const res = await request(app)
    .patch('/recrutement/candidat/1/statut')
    .send({ statut: '' })

  expect(res.status).toBe(400)
  expect(res.body.error).toBeDefined()
})

test('refuse une candidature avec un email invalide', async () => {
  const res = await request(app)
    .post('/recrutement/candidat')
    .field('nom', 'Alice')
    .field('prenom', 'Dupont')
    .field('email', 'email-invalide')
    .field('poste', 'Dev')
    .attach(
      'cv',
      Buffer.from('fake pdf content'),
      {
        filename: 'cv.pdf',
        contentType: 'application/pdf'
      }
    )

  expect(res.status).toBe(400)
  expect(res.body.error).toBe('email invalide')
})

test('refuse un CV qui n’est pas un PDF', async () => {
  const res = await request(app)
    .post('/recrutement/candidat')
    .field('nom', 'Alice')
    .field('prenom', 'Dupont')
    .field('email', 'alice@test.com')
    .field('poste', 'Dev')
    .attach(
      'cv',
      Buffer.from('fake text'),
      {
        filename: 'cv.txt',
        contentType: 'text/plain'
      }
    )

  expect(res.status).toBe(400)
  expect(res.body.error).toBe('format de fichier invalide')
})

test('retourne 500 si la base de données échoue', async () => {
  pool.query.mockRejectedValue(new Error('Database error'))

  const res = await request(app)
    .post('/recrutement/candidat')
    .field('nom', 'Alice')
    .field('prenom', 'Dupont')
    .field('email', 'alice@test.com')
    .field('poste', 'Dev')
    .attach(
      'cv',
      Buffer.from('fake pdf content'),
      {
        filename: 'cv.pdf',
        contentType: 'application/pdf'
      }
    )

  expect(res.status).toBe(500)
  expect(res.body.error).toBe('Database error')
})

test('retourne 500 si la récupération des candidatures échoue', async () => {
  pool.query.mockRejectedValue(new Error('Database error'))

  const res = await request(app)
    .get('/recrutement/candidats')

  expect(res.status).toBe(500)
  expect(res.body.error).toBe('Database error')
})

test('retourne 500 si la mise à jour échoue', async () => {
  pool.query.mockRejectedValue(new Error('Database error'))

  const res = await request(app)
    .patch('/recrutement/candidat/1/statut')
    .send({ statut: 'validé' })

  expect(res.status).toBe(500)
  expect(res.body.error).toBe('Database error')
})