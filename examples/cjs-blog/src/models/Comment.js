const { Model } = require('yorm.js')

class Comment extends Model {
  id
  author_id
  post_id
  content
  created_at
  updated_at

  get tableName() {
    return 'post_comments'
  }
}

module.exports = Comment