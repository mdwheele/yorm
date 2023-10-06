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
  let  userId

  await transaction(User, Post, async (User, Post) => {
    const user = await User.create({ name: `Susan O'Malley`, username: 'susan.omalley@nutanix.com' })

    userId = user.id

    await Post.create({ user_id: user.id, title: `My first post`, content: `Lorem ipsum!` })
  })

  const user = await User.find(userId)
  const [post] = await Post.where({ user_id: userId })
  
  expect(user.name).toContain('Susan')
  expect(post.title).toBe('My first post')

  await Post.delete()
  await User.delete()
})

test('Transactions are implicitly rolled back on any failure', async () => {
  try {
    await transaction(User, Post, async (User, Post) => {
      const user = await User.create({ name: `Susan O'Malley`, username: 'susan.omalley@nutanix.com' })
      await Post.create({ user_id: user.id, title: `My first post`, content: `Lorem ipsum!` })
      
      expect(await User.count()).toBe(1)
      expect(await Post.count()).toBe(1)
  
      throw new Error('Any exception from anywhere in this callback will roll the transaction back')
    })
  } catch (error) {
    expect(error.message).toContain('Any exception')
  }

  expect(await User.count()).toBe(0)
  expect(await Post.count()).toBe(0)
})

afterAll(() => {
  return knex.destroy()
})