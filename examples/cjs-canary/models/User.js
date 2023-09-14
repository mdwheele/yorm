const { Model } = require('yorm.js')

class User extends Model {
  id
}

module.exports = { User }