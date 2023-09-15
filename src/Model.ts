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

  protected get primaryKey(): string {
    return 'id'
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

  deserialize(record: object): object {
    return record
  }

  toJSON() {
    return this
  }

  get etag(): string {
    return etag(JSON.stringify(this))
  }

  static async create<T extends Model>(this: Constructor<T>, attributes: object): Promise<T> {
    /** @ts-ignore */
    const instance = this.make(attributes)

    const [id] = await knex(instance.tableName)
      .returning([instance.primaryKey])
      .insert(instance.serialize())

    const lastInsert = instance[instance.primaryKey] || id

    const [record] = await knex(instance.tableName).where({ uuid: lastInsert })
    Object.assign(instance, instance.deserialize(record))
    
    return instance
  }

  static make<T extends Model>(this: Constructor<T>, attributes: object): T {
    Model.#internalConstructor = true
    const instance = new this
    Object.seal(instance)

    // Will throw errors if assigning extra properties
    Object.assign(instance, attributes)
    
    return instance
  }

  static async find<T extends Model>(this: Constructor<T>, id: string | number): Promise<T> {
    Model.#internalConstructor = true
    const model = new this

    /** @ts-ignore */
    const [instance] = await this.where({ [model.primaryKey]: id })

    if (!instance) {
      return null
    }

    return instance
  }

  static async where<T extends Model>(this: Constructor<T>, attributes: object): Promise<T[]> {
    Model.#internalConstructor = true
    const model = new this

    /** @ts-ignore */
    const instances = await this.query(builder => builder.where(attributes))

    return instances
  }

  static async query<T extends Model>(this: Constructor<T>, callback: (builder: Knex.QueryBuilder) => Promise<Array<any>>): Promise<T[]> {
    Model.#internalConstructor = true
    const model = new this

    const builder = knex(model.tableName)

    const records = await callback(builder)

    return records.map(record => {
      Model.#internalConstructor = true
      const instance = new this
      Object.seal(instance)
      Object.assign(instance, instance.deserialize(record))
      return instance
    })
  }

  async save(): Promise<void> {
    await knex(this.tableName)
      .where({ [this.primaryKey]: this[this.primaryKey] })
      .update(this.serialize())
  }

  async delete(): Promise<void> {
    await knex(this.tableName)
      .where({ [this.primaryKey]: this[this.primaryKey] })
      .delete()
  }

  static async delete(): Promise<void> {
    Model.#internalConstructor = true
    const model = new this

    await knex(model.tableName).delete()
  }

  protected async hasMany<T extends Model>(model: Constructor<T>, foreignKey?: string, localKey?: string): Promise<T[]> {
    let table: string

    if (this.models[model.name] === undefined) {
      throw new TypeError(`Invalid relationship model: ${model}`)
    }

    Model.#internalConstructor = true
    const instance = new model
    table = instance.tableName

    /**
     * User-provided `foreignKey` will be used if provided.
     * 
     * If `foreignKey` is undefined, we use a pluralization convention
     * to determine the foreign key on the joining table.
     * 
     * For example, if we have User.hasMany(Photo), then the foreign
     * key field name will be `photos.user_id`.
     */
    const fk = foreignKey || `${table}.${this.tableName}_id`
    const pk = localKey || this.primaryKey

    const records = await knex(table).where({ [fk]: this[pk] })
  
    return records.map(record => {
      Model.#internalConstructor = true
      const instance = new model
      Object.seal(instance)
      Object.assign(instance, instance.deserialize(record))
      return instance
    })
  }

  protected async belongsTo<T extends Model>(model: Constructor<T>, localKey?: string | null, belongsToKey?: string | null): Promise<T> {
    let table: string

    if (this.models[model.name] === undefined) {
      throw new TypeError(`Invalid relationship model: ${model}`)
    }

    Model.#internalConstructor = true
    const modelInstance = new model
    table = modelInstance.tableName

    const pk = belongsToKey || `${table}.${modelInstance.primaryKey}`
    const lk = localKey || `${table}_id`

    const q = knex(table).where({ [pk]: this[lk] })

    const [record] = await q

    Model.#internalConstructor = true
    const instance = new model
    Object.seal(instance)
    Object.assign(instance, instance.deserialize(record))
    return instance
  }
}