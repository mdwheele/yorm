/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
exports.development = exports.staging = exports.production = exports.test = { 
  client: 'mysql2',
  debug: true,
  connection: {
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'yorm',
    database: 'yorm',
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    directory: 'database/migrations'
  }
}
