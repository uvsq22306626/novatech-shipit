const { test, expect } = require('@playwright/test')

// 1. Vérifier que le service Congés répond
test('Health check du service Congés', async ({ request }) => {
  const res = await request.get('http://localhost:3003/health')

  expect(res.status()).toBe(200)

  const body = await res.json()

  expect(body).toEqual({
    status: 'UP',
    service: 'conges'
  })
})

// 2. Vérifier une erreur de validation
test('Refuser une demande avec des champs manquants', async ({ request }) => {
  const res = await request.post(
    'http://localhost:3003/conges/demande',
    {
      data: {
        employeeId: 1,
        dateDebut: '2026-09-10'
      }
    }
  )

  expect(res.status()).toBe(400)

  const body = await res.json()

  expect(body.error).toContain('obligatoires')
})

// 3. Vérifier une période invalide
test('Refuser une demande avec une date de fin antérieure', async ({ request }) => {
  const res = await request.post(
    'http://localhost:3003/conges/demande',
    {
      data: {
        employeeId: 1,
        dateDebut: '2026-09-15',
        dateFin: '2026-09-10',
        motif: 'Vacances'
      }
    }
  )

  expect(res.status()).toBe(400)

  const body = await res.json()

  expect(body.error).toContain(
    'date de fin doit être supérieure ou égale'
  )
})