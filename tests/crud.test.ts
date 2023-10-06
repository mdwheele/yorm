import knex from './knex'
import { Model } from '../src/Model'
import * as uuid from 'uuid'

beforeAll(async () => {
  Model.knex(knex)
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

test('Create, Read, Update, and Delete model operations', async () => {
  const user = await User.create({ username: 'susan@example.com', name: 'Susan' })

  expect(user.id).toBeTruthy()
  expect(user.username).toBe('susan@example.com')

  const susan = await User.find(user.id)

  expect(susan.id).toBe(user.id)

  susan.name = 'Susan A. Longsworth'
  await susan.save()

  expect((await User.find(susan.id)).name).toBe('Susan A. Longsworth')

  await susan.delete()

  expect(await User.count()).toBe(0)
})

test('firstOrCreate', async () => {
  expect(await User.count()).toBe(0)

  const susan = await User.firstOrCreate({ username: 'susan@example.com', name: 'Susan' })

  const susanAlreadyExists = await User.firstOrCreate({ username: 'susan@example.com', name: 'Susan' })

  expect(susan.id).toBe(susanAlreadyExists.id)
  expect(await User.count()).toBe(1)

  await susan.delete()
})

test('findOrFail', () => {
  expect(User.findOrFail(uuid.v4())).rejects.toThrow('Model not found')
})

afterAll(() => {
  return knex.destroy()
})