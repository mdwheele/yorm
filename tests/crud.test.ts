import knex from './knex'
import { Model } from '../src/Model'
import * as uuid from 'uuid'

beforeAll(async () => {
  Model.useKnex(knex)
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
  deleted_at: Date

  get softDeletes() { return true }
}

test('Create, Read, Update, and Delete model operations', async () => {
  const user = await User.create({ username: 'susan@example.com', name: 'Susan' })

  expect(user.id).toBeTruthy()
  expect(user.username).toBe('susan@example.com')

  const susan = await User.find(user.id)

  expect(susan.id).toBe(user.id)

  susan.name = 'Susan A. Longsworth'
  await susan.save()

  expect((await User.find(susan.id)).name).toBe('Susan A. Longsworth')

  await susan.forceDelete()

  expect(await User.count()).toBe(0)
})

test('firstOrCreate', async () => {
  expect(await User.count()).toBe(0)

  const susan = await User.firstOrCreate({ username: 'susan@example.com', name: 'Susan' })

  const susanAlreadyExists = await User.firstOrCreate({ username: 'susan@example.com', name: 'Susan' })

  expect(susan.id).toBe(susanAlreadyExists.id)
  expect(await User.count()).toBe(1)

  await susan.forceDelete()
})

test('findOrFail', () => {
  expect(User.findOrFail(uuid.v4())).rejects.toThrow('Model not found')
})

test('soft deletes', async () => {
  const user = await User.create({ username: 'user@example.com' })

  expect(user.deleted_at).toBeNull()

  await user.delete()

  expect(user.deleted_at).not.toBeNull()

  expect(await User.find(user.id)).toBe(null)

  // There's still a row in the table...
  expect(await knex('users').count()).toEqual([{count: "1"}])

  // But YORM treats it as GONE.
  expect(await User.count()).toBe(0)
})

test('soft delete with custom key', async () => {
  class CustomKey extends Model {
    id
    deletedAt

    get deletedAtKey() {
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
})

afterAll(() => {
  return knex.destroy()
})