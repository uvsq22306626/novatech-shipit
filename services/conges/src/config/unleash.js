const { initialize } = require('unleash-client')

const unleash = initialize({
  url: process.env.UNLEASH_URL || 'http://localhost:4242/api/',
  appName: process.env.UNLEASH_APP_NAME || 'novatech-conges',
  environment: process.env.UNLEASH_ENVIRONMENT || 'development',
  customHeaders: {
    Authorization: process.env.UNLEASH_API_TOKEN
  }
})

unleash.on('ready', () => {
  console.log('Unleash connecté')
})

unleash.on('error', (error) => {
  console.error('Erreur Unleash:', error.message)
})

module.exports = unleash