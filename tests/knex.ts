import { knex } from 'knex'

const instance = knex({
  client: 'pg',
  connection: {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    database: 'yorm',
    password: 'postgres',
    ssl: false,
  },
  migrations: {
    directory: './tests/migrations'
  }
})

export default instance