export default {
  testMatch: ["**/src/tests/**/*.test.js"], // uniquement les tests unitaires
  transform: {}, // si tu n’utilises pas Babel/TS
  coverageDirectory: "coverage",
  collectCoverageFrom: ["src/**/*.js"]
}
