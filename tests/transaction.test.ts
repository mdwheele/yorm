import knex from './knex'
import { Model, transaction } from '../src'
import * as uuid from 'uuid'

beforeAll(async () => {
  Model.bind(knex)
  await knex.raw(`DROP SCHEMA public CASCADE;`)
  await knex.raw(`CREATE SCHEMA public;`)
  await knex.migrate.latest()
})

class User extends Model {
  id: string
  name: string
  username: string
  created_at: Date
  updated_at: Date
}

class Post extends Model {
  id: string
  user_id: string
  title: string
  content: string
  created_at: Date
  updated_at: Date
}

test('Model classes knex instance are rebound with transaction without affecting originals', async () => {
  transaction(User, Post, async (TransactingUser, TransactingPost) => {
    expect(User.knex.isTransaction).toBeUndefined()
    expect(Post.knex.isTransaction).toBeUndefined()
    expect(TransactingUser.knex.isTransaction).toBe(true)
    expect(TransactingPost.knex.isTransaction).toBe(true)
  })
})

test('Transactions are implicitly committed', async () => {
  await transaction(User, Post, async (User, Post) => {
    const user = await User.create({ name: `Susan O'Malley`, username: 'susan.omalley@nutanix.com' })
  })
})

afterAll(() => {
  return knex.destroy()
})