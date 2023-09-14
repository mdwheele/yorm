const knexfile = require('../knexfile.js')

const knex = require('knex').default(knexfile)

const Model = require('../../src/Model.js')

Model.boot(knex)

module.exports = knex