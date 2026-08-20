const express = require('express')
const multer = require('multer')
const { Pool } = require('pg')

const app = express()
app.use(express.json())

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

// =====================================================
// MODE MOCK DB — utilisé uniquement pour les tests E2E
// =====================================================

if (process.env.MOCK_DB === 'true') {
  pool.query = async (sql, params) => {
    if (sql.startsWith('INSERT INTO candidats')) {
      return {
        rows: [{
          id: 1,
          nom: params[0],
          prenom: params[1],
          email: params[2],
          poste: params[3],
          cv_path: params[4] || '/tmp/uploads/cv.pdf',
          created_at: new Date()
        }]
      }
    }

    if (sql.startsWith('SELECT')) {
      return {
        rows: [
          {
            id: 1,
            nom: 'Alice',
            prenom: 'Dupont',
            email: 'alice@test.com',
            poste: 'Dev',
            statut: 'en attente'
          },
          {
            id: 2,
            nom: 'Bob',
            prenom: 'Martin',
            email: 'bob@test.com',
            poste: 'QA',
            statut: 'validé'
          }
        ]
      }
    }

    if (sql.startsWith('UPDATE')) {
      return { rowCount: 1 }
    }

    return { rows: [] }
  }
}

// =====================================================
// CONFIGURATION UPLOAD CV
// =====================================================

const storage = multer.diskStorage({
  destination: '/tmp/uploads/',
  filename: (req, file, cb) => {
    cb(null, file.originalname)
  }
})

const upload = multer({
  storage,

  // Autoriser uniquement les PDF
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('format de fichier invalide'))
    }

    cb(null, true)
  }
})

// =====================================================
// POST /recrutement/candidat
// =====================================================

app.post(
  '/recrutement/candidat',
  (req, res, next) => {
    upload.single('cv')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          error: err.message
        })
      }

      next()
    })
  },
  async (req, res) => {
    const { nom, prenom, email, poste } = req.body

    // Champs obligatoires
    if (!nom || !prenom || !email || !poste) {
      return res.status(400).json({
        error: 'Champs obligatoires manquants'
      })
    }

    // Vérification email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'email invalide'
      })
    }

    try {
      const result = await pool.query(
        `INSERT INTO candidats
        (nom, prenom, email, poste, cv_path, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *`,
        [
          nom,
          prenom,
          email,
          poste,
          req.file?.path
        ]
      )

      res.status(200).json(result.rows[0])
    } catch (err) {
      res.status(500).json({
        error: err.message
      })
    }
  }
)

// =====================================================
// GET /recrutement/candidats
// =====================================================

app.get('/recrutement/candidats', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM candidats ORDER BY created_at DESC'
    )

    res.status(200).json(result.rows)
  } catch (err) {
    res.status(500).json({
      error: err.message
    })
  }
})

// =====================================================
// PATCH /recrutement/candidat/:id/statut
// =====================================================

app.patch('/recrutement/candidat/:id/statut', async (req, res) => {
  const { id } = req.params
  const { statut } = req.body

  if (!statut || statut.trim() === '') {
    return res.status(400).json({
      error: 'Statut invalide'
    })
  }

  try {
    await pool.query(
      'UPDATE candidats SET statut = $1 WHERE id = $2',
      [statut, id]
    )

    res.status(200).json({
      success: true
    })
  } catch (err) {
    res.status(500).json({
      error: err.message
    })
  }
})

// =====================================================
// EXPORT POUR LES TESTS
// =====================================================

module.exports = app

// =====================================================
// DÉMARRAGE DU SERVEUR
// =====================================================

if (require.main === module) {
  app.listen(3004, () => {
    console.log('Recrutement service running on :3004')
  })
}