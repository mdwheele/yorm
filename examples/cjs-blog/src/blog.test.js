const knex = require('../src/knex.js')
const config = require('../src/config.js')
const uuid = require('uuid')

const { User, Post, Comment } = require('./models')

beforeAll(async () => {
  await knex.raw(`DROP SCHEMA public CASCADE;`)
  await knex.raw(`CREATE SCHEMA public;`)
  await knex.migrate.latest()
})

test(`Let's make a blog!`, async () => {
  const susan = await User.create({
    email: 'susan@example.com',
    name: 'Susan Example',
  })

  const john = await User.create({
    email: 'jsmith@example.com',
    name: 'John Smith'
  })

  const deleteMe = await User.create({
    email: 'del.me@example.com',
    name: 'Delete M. E.'
  })

  expect(susan.email).toBe('susan@example.com')
  expect(john.name).toBe('John Smith')

  // Can make changes to properties and persist them.
  john.name = 'J. Smith'
  await john.save()

  const [newJohn] = await User.where({ id: john.id })

  expect(newJohn.name).toBe('J. Smith')
  expect(newJohn.id).toBe(john.id)

  // Can fetch models by identity
  const newSusan = await User.find(susan.id)
  expect(newSusan.id).toBe(susan.id)

  // `id` is automatically assigned to UUID based
  // on database migration. Model is unaware.
  expect(uuid.validate(susan.id)).toBeTruthy()
  expect(uuid.validate(john.id)).toBeTruthy()

  expect(await User.count()).toBe(3)

  await deleteMe.delete()

  expect (await User.count()).toBe(2)

  const post = await Post.create({
    author_id: john.id,
    title: 'My First YORM Post',
    content: 'Check it out!'
  })

  const another = await Post.create({
    author_id: susan.id,
    title: 'Yet another blog post...',
    content: 'Say whaaaaaaaaaaaat?'
  })

  const yetAnother = await Post.create({
    author_id: susan.id,
    title: 'One more so Susan has two!',
    content: 'Yeah!'
  })

  expect(uuid.validate(post.id)).toBeTruthy()
  expect(await Post.count()).toBe(3)

  await Comment.create({
    author_id: susan.id,
    post_id: post.id,
    content: 'I really liked this post by John. I hope he writes more.'
  })

  await Comment.create({
    author_id: john.id,
    post_id: another.id,
    content: 'Susan writes the best posts in the whole world.'
  })

  await Comment.create({
    author_id: susan.id,
    post_id: another.id,
    content: 'Thanks so much John! I really appreciate that.'
  })

  expect(await Comment.count()).toBe(3)

  const [comment] = await Comment.where({ author_id: john.id })

  expect(comment.post_id).toBe(another.id)

  await comment.delete()

  expect(await Comment.count()).toBe(2)

  // Relationships!
  const posts = await susan.posts()

  expect(posts.length).toBe(2)
  expect(posts[0].id).toBe(another.id)
  expect(posts[1].id).toBe(yetAnother.id)

  const comments = await susan.comments()

  expect(comments.length).toBe(2)
})

afterAll(() => {
  return knex.destroy()
})