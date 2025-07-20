const express = require('express')
const { Model } = require('yorm.js')
const { knex } = require('knex')
const knexfile = require('./knexfile.js')
const crypto = require('node:crypto')
const { hashPassword, verifyPassword } = require('./lib/password.js')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')

Model.configure(knex(knexfile[process.env.NODE_ENV || 'development']))

class User extends Model {
  id
  username
  password

  static hidden = ['password']

  tasks() {
    return this.hasMany(Task, 'owner_id', 'id')
  }

  comments() {
    return this.hasMany(Comment, 'author_id', 'id')
  }
}

class Task extends Model {
  id
  title
  description
  owner_id

  user() {
    return this.belongsTo(User, 'owner_id', 'id')
  }

  comments() {
    return this.hasMany(Comment, 'task_id', 'id')
  }
}

class Comment extends Model {
  id
  content
  author_id
  task_id

  author() {
    return this.belongsTo(User, 'author_id', 'id')
  }
}

(async () => {
  const db = Model.getKnex()
  
  await db.raw('SET foreign_key_checks = 0')
  await db.table('comments').truncate()
  await db.table('tasks').truncate()
  await db.table('users').truncate()
  await db.raw('SET foreign_key_checks = 1')

  const sam = await User.firstOrCreate({ 
    username: 'sam@example.com', 
    password: await hashPassword('yorm.js') 
  })

  const bob = await User.firstOrCreate({ 
    username: 'bob@example.com', 
    password: await hashPassword('yorm.js') 
  })

  const task1 = await Task.create({ title: 'Create a Yorm.js example app', owner_id: sam.getKey() })
  const task2 = await Task.create({ title: 'Run to the grocery store', owner_id: bob.getKey() })
  
  if (task1 && task2) {
    await Comment.create({ content: 'Great idea!', author_id: bob.getKey(), task_id: task1.getKey() })
    await Comment.create({ content: 'Need to add more tests', author_id: sam.getKey(), task_id: task1.getKey() })
    await Comment.create({ content: 'Don\'t forget the milk', author_id: sam.getKey(), task_id: task2.getKey() })
  }

  const app = express()

  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  app.use(cookieParser())

  app.post('/login', async (req, res) => {
    const { username, password } = req.body

    const user = await User.where('username', username).first()

    if (!user || !(await verifyPassword(password, user.password || user.attributes.password))) {
      return res.status(401).send()
    } 

    res.cookie('jwt', jwt.sign({ uid: user.username }, process.env.SECRET || 'shhhh'))
    res.send()
  })

  app.use(async (req, res, next) => {
    try {
      const token = await jwt.verify(req.cookies['jwt'], process.env.SECRET || 'shhhh')
      req.user = await User.where('username', token.uid).first()
      next()
    } catch (error) {
      return res.status(401).send()
    }
  })

  app.get('/tasks', async (req, res) => {
    const tasks = await Task.query()
      .with(['user', 'comments.author'])
      .get()

    res.json(tasks)
  })

  app.get('/tasks/:id', async (req, res) => {
    const task = await Task.query()
      .with(['user', 'comments.author'])
      .find(req.params.id)
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' })
    }
    
    res.json(task)
  })

  app.post('/tasks/:id/comments', async (req, res) => {
    const task = await Task.findOrFail(req.params.id)

    const comment = await Comment.create({
      content: req.body.content,
      author_id: req.user.id,
      task_id: req.params.id
    })

    res.json(comment)
  })

  app.listen(3000)
})()