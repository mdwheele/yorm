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

  comments() {
    // You can also pass in a string that maps to the name of a model
    // that was passed to Model.associate(...) calls during bootstrapping.
    return this.hasMany('Comment', 'author_id')
  }
}

module.exports = User