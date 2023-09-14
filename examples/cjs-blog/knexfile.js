const config = require('./src/config.js')

module.exports = {
  client: 'pg',
  connection: {
    host: config.pg.host,
    port: 5432,
    user: config.pg.user,
    database: config.pg.database,
    password: config.pg.password,
    ssl: false,
  },
  migrations: {
    directory: './examples/cjs-blog/migrations'
  }
}