const User = require('./User.js')
const Post = require('./Post.js')
const Comment = require('./Comment.js')

const models = { User, Post, Comment }

Object.keys(models).forEach(key => {
  models[key].register(models)
})

module.exports = models