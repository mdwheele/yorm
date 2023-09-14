const pluralize = require('pluralize')

/** @type {import('knex').Knex} */
let knex

let _models

class Model {
  static #internalConstructor = false

  constructor() {
    if (!Model.#internalConstructor) {
      throw new TypeError(`Models cannot be manually constructed. Use ${this.constructor.name}.make() or ${this.constructor.name}.create()`)
    }
    
    Model.#internalConstructor = false
  }

  static boot(instance) {
    knex = instance
  }

  static associate(models) {
    _models = models
  }

  get tableName() {
    return pluralize(this.constructor.name).toLowerCase()
  }

  get models() {
    return _models
  }

  static async count() {
    Model.#internalConstructor = true
    const model = new this

    const [result] = await knex(model.tableName).count()

    return Number(result.count)
  }

  serialize() {
    return this
  }

  static async delete() {
    Model.#internalConstructor = true
    const model = new this

    await knex(model.tableName).delete()
  }

  static async create(attributes) {
    Model.#internalConstructor = true
    const instance = new this
    Object.seal(instance)

    // Will throw errors if assigning extra properties
    Object.assign(instance, attributes)

    const [record] = await knex(instance.tableName)
      .returning(Object.keys(instance))
      .insert(instance)

    Object.assign(instance, record)
    
    return instance
  }

  static async make(attributes) {
    Model.#internalConstructor = true
    const instance = new this
    Object.seal(instance)

    // Will throw errors if assigning extra properties
    Object.assign(instance, attributes)
    
    return instance
  }

  static async find(id) {
    Model.#internalConstructor = true
    const instance = new this
    Object.seal(instance)

    const [record] = await knex(instance.tableName).where({ id })

    Object.assign(instance, record)

    return instance
  }

  static async where(attributes) {
    Model.#internalConstructor = true
    const model = new this

    const records = await knex(model.tableName).where(attributes)

    return records.map(record => {
      Model.#internalConstructor = true
      const instance = new this
      Object.seal(instance)
      Object.assign(instance, record)

      return instance
    })
  }

  async save() {
    await knex(this.tableName)
      .returning(Object.keys(this))
      .where({ id: this.id }) // TODO: Allow model to override primary key field.
      .update(this)
  }

  async delete() {
    // TODO: Allow model to override primary key field.
    await knex(this.tableName).where({ id: this.id }).delete()
  }

  async hasMany(model, foreignKey, localKey) {
    let table, cls

    if (typeof model === 'string' && this.models[model] !== undefined) {
      cls = this.models[model]
    } else if (typeof model === 'function') {
      cls = model
    } else {
      throw new TypeError(`Invalid relationship model: ${model}`)
    }

    Model.#internalConstructor = true
    const instance = new cls
    table = instance.tableName

    const fk = foreignKey || `${table}.${pluralize.singular(this.tableName)}_id`

    const records = await knex(table).where({
      [fk]: this.id
    })

    return records.map(record => {
      Model.#internalConstructor = true
      const instance = new cls

      Object.seal(instance)
      Object.assign(instance, record)

      return instance
    })
  }
}

module.exports = Model