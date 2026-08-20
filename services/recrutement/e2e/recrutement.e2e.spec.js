import { test, expect } from '@playwright/test'

// 1️⃣ Créer une candidature valide
test('Créer une candidature valide via API', async ({ request }) => {
  const res = await request.post('http://localhost:3004/recrutement/candidat', {
    multipart: {
      nom: 'Alice',
      prenom: 'Dupont',
      email: 'alice@test.com',
      poste: 'Dev',
      cv: {
        name: 'cv.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('fake pdf content')
      }
    }
  })

  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.email).toBe('alice@test.com')
})

// 2️⃣ Consulter la liste des candidatures
test('Consulter la liste des candidatures', async ({ request }) => {
  const res = await request.get('http://localhost:3004/recrutement/candidats')
  expect(res.status()).toBe(200)

  const body = await res.json()
  expect(Array.isArray(body)).toBeTruthy()
  expect(body.length).toBeGreaterThan(0)
  expect(body[0]).toHaveProperty('email')
})

// 3️⃣ Mettre à jour le statut d’une candidature
test('Mettre à jour le statut', async ({ request }) => {
  const res = await request.patch('http://localhost:3004/recrutement/candidat/1/statut', {
    data: { statut: 'validé' }
  })

  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.success).toBe(true)
})

// 4️⃣ Uploader un CV
test('Uploader un CV', async ({ request }) => {
  const res = await request.post('http://localhost:3004/recrutement/candidat', {
    multipart: {
      nom: 'Bob',
      prenom: 'Martin',
      email: 'bob@test.com',
      poste: 'QA',
      cv: {
        name: 'cv.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('fake pdf content')
      }
    }
  })

  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.cv_path).toContain('cv.pdf')
})

// 5️⃣ Erreur de validation (champ manquant)
test('Erreur de validation - email manquant', async ({ request }) => {
  const res = await request.post('http://localhost:3004/recrutement/candidat', {
    multipart: {
      nom: 'Charlie',
      prenom: 'Durand',
      poste: 'Dev'
      // email manquant volontairement
    }
  })

  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.error).toContain('Champs obligatoires')
})
