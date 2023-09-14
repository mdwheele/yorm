const dotenv = require('dotenv')
const { expand } = require('dotenv-expand')

expand(dotenv.config())

module.exports = {
  pg: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  }
}