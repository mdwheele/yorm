import knex from './knex'
import { Model } from '../src/Model'

beforeAll(async () => {
  Model.boot(knex)
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

/**
 * This function represents a web controller accepting updated
 * values for a User along with etag-based optimistic locking.
 */
async function ChangeUsername(id, username, etag) {
  const user = await User.find(id)

  if (etag !== user.etag) {
    throw new Error('User has changed since last fetch')
  }

  user.username = username

  await user.save()
}

test('etags can be used to implement optimistic locking', async () => {
  const user = await User.create({ name: 'Example User', username: 'user@example.com' })

  await ChangeUsername(user.id, 'changed@example.com', user.etag)

  expect(ChangeUsername(user.id, 'something.else@example.com', user.etag)).rejects.toThrow('User has changed since last fetch')

  await user.delete()
})

test('refetching user before trying to update works as expected', async () => {
  const user = await User.create({ name: 'Example User', username: 'user@example.com' })

  await ChangeUsername(user.id, 'changed@example.com', user.etag)

  const refreshed = await User.find(user.id)

  await ChangeUsername(user.id, 'something.else@example.com', refreshed.etag)

  expect((await User.find(user.id)).username).toBe('something.else@example.com')

  await user.delete()
})

afterAll(() => {
  knex.destroy()
})