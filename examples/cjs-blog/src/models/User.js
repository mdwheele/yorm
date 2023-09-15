const { Model } = require('yorm.js')

class User extends Model {
  id
  email
  name
  created_at
  updated_at

  posts() {
    // Normally, hasMany would compute that the foreign key on 
    // the posts table should be `user_id`, referencing this model's
    // singularized table name. However, we can also override that
    // behaviour like so.
    return this.hasMany(this.models.Post, 'author_id')
  }

  /**
   * @returns {Promise<import('./Comment.js')[]>}
   */
  comments() {
    return this.hasMany(this.models.Comment, 'author_id')
  }
}

module.exports = User