const bcrypt = require('bcrypt')

async function hashPassword(string) {
  return await bcrypt.hash(string, 10)
}

async function verifyPassword(plain, hashed) {
  return await bcrypt.compare(plain, hashed)
}

module.exports = {
  hashPassword,
  verifyPassword
}