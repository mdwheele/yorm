import { Knex } from 'knex'
import pluralize from 'pluralize'
import etag from 'etag'

interface Constructor<M> {
  new (...args: any[]): M
}

let knex: Knex

let _models

export class Model {
  [key: string]: any

  static #internalConstructor: boolean = false

  constructor() {
    if (!Model.#internalConstructor) {
      throw new TypeError(`Models cannot be manually constructed. Use ${this.constructor.name}.make() or ${this.constructor.name}.create()`)
    }
    
    Model.#internalConstructor = false
  }

  static boot(instance: Knex): void {
    knex = instance
  }

  static associate(models): void {
    _models = models
  }

  protected get tableName(): string {
    return pluralize(this.constructor.name).toLowerCase()
  }

  protected get models() {
    return _models
  }

  static async count(): Promise<number> {
    Model.#internalConstructor = true
    const model = new this

    const [result] = await knex(model.tableName).count()

    const [count] = Object.values(result)

    return Number(count)
  }

  serialize(): object {
    return this
  }

  toJSON() {
    return this
  }

  get etag(): string {
    return etag(JSON.stringify(this))
  }

  static async create<T extends Model>(this: Constructor<T>, attributes: object): Promise<T> {
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

  static async make<T extends Model>(this: Constructor<T>, attributes: object): Promise<T> {
    Model.#internalConstructor = true
    const instance = new this
    Object.seal(instance)

    // Will throw errors if assigning extra properties
    Object.assign(instance, attributes)
    
    return instance
  }

  static async find<T extends Model>(this: Constructor<T>, id: string | number): Promise<T> {
    Model.#internalConstructor = true
    const instance = new this
    Object.seal(instance)

    const [record] = await knex(instance.tableName).where({ id })

    Object.assign(instance, record)

    return instance
  }

  static async where<T extends Model>(this: Constructor<T>, attributes: object): Promise<T[]> {
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

  async save(): Promise<void> {
    await knex(this.tableName)
      .returning(Object.keys(this))
      .where({ id: this.id }) // TODO: Allow model to override primary key field.
      .update(this)
  }

  async delete(): Promise<void> {
    // TODO: Allow model to override primary key field.
    await knex(this.tableName).where({ id: this.id }).delete()
  }

  protected async hasMany<T extends Model>(model: Constructor<T>, foreignKey?: string, localKey?: string): Promise<T[]> {
    let table: string

    if (this.models[model.name] === undefined) {
      throw new TypeError(`Invalid relationship model: ${model}`)
    }

    Model.#internalConstructor = true
    const instance = new model
    table = instance.tableName

    const fk = foreignKey || `${table}.${pluralize.singular(this.tableName)}_id`

    const records = await knex(table).where({
      [fk]: this.id
    })

    return records.map(record => {
      Model.#internalConstructor = true
      const instance = new model

      Object.seal(instance)
      Object.assign(instance, record)

      return instance
    })
  }
}