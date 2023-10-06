const knexfile = require('../knexfile.js')

const knex = require('knex').default(knexfile)

const { Model } = require('yorm.js')

Model.bind(knex)

module.exports = knex