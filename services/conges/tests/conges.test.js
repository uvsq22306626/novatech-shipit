const request = require('supertest')

// Mock PostgreSQL
jest.mock('pg', () => {
  const mockQuery = jest.fn()

  return {
    Pool: jest.fn(() => ({
      query: mockQuery
    })),
    __mockQuery: mockQuery
  }
})

// Mock Unleash
jest.mock('../src/config/unleash', () => ({
  isEnabled: jest.fn()
}))

const { __mockQuery } = require('pg')
const unleash = require('../src/config/unleash')
const { app } = require('../src/app')

describe('Service Congés', () => {
  beforeEach(() => {
    // Réinitialise PostgreSQL entre chaque test
    __mockQuery.mockReset()

    // Réinitialise Unleash entre chaque test
    unleash.isEnabled.mockReset()

    // Par défaut, le feature flag est désactivé
    unleash.isEnabled.mockReturnValue(false)
  })

  describe('GET /health', () => {
    test('doit retourner le statut UP', async () => {
      const response = await request(app).get('/health')

      expect(response.status).toBe(200)

      expect(response.body).toEqual({
        status: 'UP',
        service: 'conges'
      })
    })
  })

  describe('GET /conges/solde/:employeeId', () => {
    test('doit retourner le solde de congés', async () => {
      __mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              jours_conges_acquis: 25
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { nombre_jours: 5 },
            { nombre_jours: 2 }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { nombre_jours: 3 }
          ]
        })

      const response = await request(app)
        .get('/conges/solde/1')

      expect(response.status).toBe(200)

      expect(response.body).toEqual({
        solde: 18,
        joursAcquis: 25,
        joursPris: 7,
        joursEnAttente: 3
      })
    })

    test('doit retourner 404 si employé introuvable', async () => {
      __mockQuery.mockResolvedValueOnce({
        rows: []
      })

      const response = await request(app)
        .get('/conges/solde/999')

      expect(response.status).toBe(404)

      expect(response.body).toEqual({
        error: 'Employé introuvable'
      })
    })

    test('doit retourner 500 en cas erreur base de données', async () => {
      __mockQuery.mockRejectedValueOnce(
        new Error('Database error')
      )

      const response = await request(app)
        .get('/conges/solde/1')

      expect(response.status).toBe(500)

      expect(response.body).toEqual({
        error: 'Erreur interne du serveur'
      })
    })
  })

  describe('POST /conges/demande', () => {
    test('doit créer une demande valide en attente quand le flag est OFF', async () => {
      unleash.isEnabled.mockReturnValue(false)

      __mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 10,
            employee_id: 1,
            date_debut: '2026-09-01',
            date_fin: '2026-09-03',
            nombre_jours: 3,
            motif: 'Vacances',
            statut: 'en_attente'
          }
        ]
      })

      const response = await request(app)
        .post('/conges/demande')
        .send({
          employeeId: 1,
          dateDebut: '2026-09-01',
          dateFin: '2026-09-03',
          motif: 'Vacances'
        })

      expect(response.status).toBe(201)
      expect(response.body.nombre_jours).toBe(3)
      expect(response.body.statut).toBe('en_attente')

      // Vérifie que le flag a bien été consulté
      expect(unleash.isEnabled).toHaveBeenCalledWith(
        'conges-automatic-approval',
        {},
        false
      )

      // Vérifie que le statut envoyé à PostgreSQL est en_attente
      expect(__mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [
          1,
          '2026-09-01',
          '2026-09-03',
          3,
          'Vacances',
          'en_attente'
        ]
      )
    })

    test('doit approuver automatiquement un congé de 3 jours quand le flag est ON', async () => {
      unleash.isEnabled.mockReturnValue(true)

      __mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 11,
            employee_id: 1,
            date_debut: '2026-09-10',
            date_fin: '2026-09-12',
            nombre_jours: 3,
            motif: 'Vacances',
            statut: 'approuve'
          }
        ]
      })

      const response = await request(app)
        .post('/conges/demande')
        .send({
          employeeId: 1,
          dateDebut: '2026-09-10',
          dateFin: '2026-09-12',
          motif: 'Vacances'
        })

      expect(response.status).toBe(201)
      expect(response.body.nombre_jours).toBe(3)
      expect(response.body.statut).toBe('approuve')

      expect(unleash.isEnabled).toHaveBeenCalledWith(
        'conges-automatic-approval',
        {},
        false
      )

      expect(__mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [
          1,
          '2026-09-10',
          '2026-09-12',
          3,
          'Vacances',
          'approuve'
        ]
      )
    })

    test('doit laisser un congé de 4 jours en attente même quand le flag est ON', async () => {
      unleash.isEnabled.mockReturnValue(true)

      __mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 12,
            employee_id: 1,
            date_debut: '2026-09-20',
            date_fin: '2026-09-23',
            nombre_jours: 4,
            motif: 'Congé long',
            statut: 'en_attente'
          }
        ]
      })

      const response = await request(app)
        .post('/conges/demande')
        .send({
          employeeId: 1,
          dateDebut: '2026-09-20',
          dateFin: '2026-09-23',
          motif: 'Congé long'
        })

      expect(response.status).toBe(201)
      expect(response.body.nombre_jours).toBe(4)
      expect(response.body.statut).toBe('en_attente')

      expect(__mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [
          1,
          '2026-09-20',
          '2026-09-23',
          4,
          'Congé long',
          'en_attente'
        ]
      )
    })

    test('doit compter un congé sur une seule journée comme 1 jour', async () => {
      unleash.isEnabled.mockReturnValue(false)

      __mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 13,
            employee_id: 1,
            date_debut: '2026-09-01',
            date_fin: '2026-09-01',
            nombre_jours: 1,
            motif: 'Rendez-vous',
            statut: 'en_attente'
          }
        ]
      })

      const response = await request(app)
        .post('/conges/demande')
        .send({
          employeeId: 1,
          dateDebut: '2026-09-01',
          dateFin: '2026-09-01',
          motif: 'Rendez-vous'
        })

      expect(response.status).toBe(201)
      expect(response.body.nombre_jours).toBe(1)
    })

    test('doit retourner 400 si un champ obligatoire manque', async () => {
      const response = await request(app)
        .post('/conges/demande')
        .send({
          employeeId: 1,
          dateDebut: '2026-09-01'
        })

      expect(response.status).toBe(400)

      expect(response.body).toEqual({
        error:
          'employeeId, dateDebut, dateFin et motif sont obligatoires'
      })
    })

    test('doit retourner 400 si les dates sont invalides', async () => {
      const response = await request(app)
        .post('/conges/demande')
        .send({
          employeeId: 1,
          dateDebut: 'date-invalide',
          dateFin: '2026-09-03',
          motif: 'Vacances'
        })

      expect(response.status).toBe(400)

      expect(response.body).toEqual({
        error: 'Les dates sont invalides'
      })
    })

    test('doit retourner 400 si la date de fin précède la date de début', async () => {
      const response = await request(app)
        .post('/conges/demande')
        .send({
          employeeId: 1,
          dateDebut: '2026-09-10',
          dateFin: '2026-09-05',
          motif: 'Vacances'
        })

      expect(response.status).toBe(400)

      expect(response.body).toEqual({
        error:
          'La date de fin doit être supérieure ou égale à la date de début'
      })
    })

    test('doit retourner 500 si PostgreSQL échoue pendant insertion', async () => {
      unleash.isEnabled.mockReturnValue(false)

      __mockQuery.mockRejectedValueOnce(
        new Error('Insert failed')
      )

      const response = await request(app)
        .post('/conges/demande')
        .send({
          employeeId: 1,
          dateDebut: '2026-09-01',
          dateFin: '2026-09-03',
          motif: 'Vacances'
        })

      expect(response.status).toBe(500)

      expect(response.body).toEqual({
        error: 'Erreur interne du serveur'
      })
    })
  })
})