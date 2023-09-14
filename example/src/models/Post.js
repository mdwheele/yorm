const Model = require('../../../src/Model.js')

class Post extends Model {
  id
  author_id
  title
  content
  created_at
  updated_at
}

module.exports = Post