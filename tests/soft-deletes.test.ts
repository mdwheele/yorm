import knex from './knex'
import { Model } from '../src/Model'
import * as uuid from 'uuid'

beforeAll(async () => {
  Model.boot(knex)
  await knex.raw(`DROP SCHEMA public CASCADE;`)
  await knex.raw(`CREATE SCHEMA public;`)
  await knex.migrate.latest()
})

class User extends Model {
  id: string
  username: string
  deleted_at: Date

  get tableName() { return 'users_soft_deletes' }
  get softDeletes() { return true }
}

test('soft deletes', async () => {
  const user = await User.create({ username: 'user@example.com' })

  expect(user.deleted_at).toBeNull()

  await user.delete()

  expect(user.deleted_at).not.toBeNull()

  expect(await User.find(user.id)).toBe(null)

  // There's still a row in the table...
  expect(await knex('users_soft_deletes').count()).toEqual([{count: "1"}])

  // But YORM treats it as GONE.
  expect(await User.count()).toBe(0)

  await user.forceDelete()
})

test('soft delete with custom key', async () => {
  class CustomKey extends Model {
    id
    deletedAt

    get deletedAtColumn() {
      return 'deletedAt'
    }

    get softDeletes() {
      return true
    }

    get tableName() {
      return 'custom_deleted_at'
    }
  }

  const model = await CustomKey.create()

  expect(model.deletedAt).toBeNull()

  await model.delete()

  expect(model.deletedAt).not.toBeNull()

  await model.forceDelete()
})

test('restore soft-deleted models', async () => {
  const user = await User.create({ username: 'user@example.com' })
  await user.delete()

  expect(await User.count()).toBe(0)

  await user.restore()
  expect(await User.count()).toBe(1)

  await user.forceDelete()
})

test('restore models matching criteria', async () => {
  // Put a few deleted records into the past.
  await knex('users_soft_deletes').insert([
    { id: uuid.v4(), username: 'old.user@example.com', deleted_at: new Date(2023, 0, 1) },
    { id: uuid.v4(), username: 'older.user@example.com', deleted_at: new Date(2021, 0, 1) },
  ])

  const user = await User.create({ username: 'user@example.com' })
  await user.delete()

  expect(await User.count()).toBe(0)

  // Restore accounts deleted after 2022
  await User.restore(query => {
    query.where('deleted_at', '>=', '2022-01-01')
  })

  expect(await User.count()).toBe(2)
})

afterAll(() => {
  return knex.destroy()
})