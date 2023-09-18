import { Knex } from 'knex'
import pluralize from 'pluralize'
import etag from 'etag'
import { pick, omit, cloneDeep } from 'lodash'
import * as uuid from 'uuid'
import ulidx from 'ulidx'
import { nanoid } from 'nanoid'

interface Constructor<M> {
  new (...args: any[]): M
}

type SupportedUniqueId = null | string | 'uuid' | 'ulid' | 'nanoid'

type ConfigOptions = {
  deletedAtColumn?: string,
}

/**
 * The Knex instance that will be used by all YORM models. This is set through 
 * Model.boot(...) method and should not be changed after the fact.
 */
let knex: Knex

/**
 * This is provided to all child classes as `this.models`. This pattern
 * allows developers to "register" models with one another without creating
 * circular dependencies in the module loader. Nothing should touch this except
 * for `Model`.
 */
let modelRegistry

/**
 * Non-enumerable key to store a Set<string> for dirty-tracking in Model. 
 */
const $dirty = Symbol('dirty')

function trackChanges<T extends Model>(object: T): T {
  return new Proxy(object, {
    set(object, key, value) {
      if (object[key as any] !== value) {
        object[$dirty as any].add(key)
        /** @ts-ignore */
        object[key as any] = value
      }

      return true
    }
  })
}

export class Model {
  [key: string]: any

  static #deletedAtColumn: string
  static #internalConstructor: boolean = false

  constructor() {
    if (!Model.#internalConstructor) {
      throw new TypeError(`Models cannot be manually constructed. Use ${this.constructor.name}.make() or ${this.constructor.name}.create()`)
    }

    Object.defineProperty(this, $dirty, { enumerable: false, configurable: false, value: new Set() })

    Model.#internalConstructor = false
  }

  static boot(instance: Knex, options: ConfigOptions = {}): void {
    knex = instance

    Model.#deletedAtColumn = options.deletedAtColumn || 'deleted_at'
  }

  static register(models): void {
    modelRegistry = models
  }

  protected get tableName(): string {
    return pluralize(this.constructor.name).toLowerCase()
  }

  protected get primaryKey(): string {
    return 'id'
  }

  protected get newUniqueId(): SupportedUniqueId {
    return null
  }

  protected get hidden(): string[] {
    return []
  }

  protected get softDeletes(): boolean {
    return false
  }
  
  protected get deletedAtColumn(): string {
    return Model.#deletedAtColumn
  }

  protected get models() {
    return modelRegistry
  }

  isDirty(fields: string | string[] = []): boolean {
    const dirtyFields = this[$dirty as any]

    if (!dirtyFields) {
      return false
    }

    if (typeof fields === 'string') {
      return dirtyFields.has(fields)
    } else if (Array.isArray(fields) && fields.length > 0) {
      return fields.some(field => this[$dirty as any].has(field))
    } else {
      return dirtyFields.size > 0
    }
  }

  isClean(fields: string | string[] = []): boolean {
    return !this.isDirty(fields)
  }

  wasChanged(): string[] {
    return [...this[$dirty as any].values()]
  }

  static async count(): Promise<number> {
    Model.#internalConstructor = true
    const model = new this

    const builder = knex(model.tableName)

    if (model.softDeletes) {
      builder.whereNull(model.deletedAtColumn)
    }

    const [result] = await builder.count()

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
    return omit(this, this.hidden)
  }

  get etag(): string {
    const clone = cloneDeep(this)
    clone.toJSON = undefined    
    return etag(JSON.stringify(clone))
  }

  static async firstOrCreate<T extends Model>(this: Constructor<T>, attributes: object = {}): Promise<T> {
    /** @ts-ignore */
    const [existing] = await this.where(attributes)

    if (existing) {
      return existing
    }

    /** @ts-ignore */
    return this.create(attributes)
  }

  static async create<T extends Model>(this: Constructor<T>, attributes: object = {}): Promise<T> {
    /** @ts-ignore */
    const instance = this.make(attributes)

    const [id] = await knex(instance.tableName)
      .returning([instance.primaryKey])
      .insert(instance.serialize())

    // The form of this is likely driver specific.
    // TODO: Look into this. This works for PostgreSQL.
    const { id: lastInsert } = instance[instance.primaryKey] || id

    const [record] = await knex(instance.tableName).where({ [instance.primaryKey]: lastInsert })

    /** @ts-ignore */
    const freshInstance = this.make(record)
    Object.assign(freshInstance, freshInstance.deserialize(record))
    
    return freshInstance
  }

  static make<T extends Model>(this: Constructor<T>, attributes: object = {}): T {
    Model.#internalConstructor = true
    const instance = new this
    Object.seal(instance)

    if (instance.newUniqueId !== null) {
      if (instance.newUniqueId === 'uuid') {
        /** @ts-ignore */
        instance[instance.primaryKey] = uuid.v4()
      } else if (instance.newUniqueId === 'ulid') {
        /** @ts-ignore */
        instance[instance.primaryKey] = ulidx.ulid()
      } else if (instance.newUniqueId === 'nanoid') {
        /** @ts-ignore */
        instance[instance.primaryKey] = nanoid()
      } else if (typeof instance.newUniqueId === 'string') {
        /** @ts-ignore */
        instance[instance.primaryKey] = instance.newUniqueId
      } else {
        throw new TypeError('Accessor `newUniqueId` must return a string.')
      }
    }

    if (instance.softDeletes) {
      /** @ts-ignore */
      instance[instance.deletedAtColumn] = null
    }

    Object.assign(instance, instance.deserialize(attributes))

    return trackChanges<T>(instance)
  }

  static async find<T extends Model>(this: Constructor<T>, id: string | number): Promise<T> {
    Model.#internalConstructor = true
    const model = new this

    /** @ts-ignore */
    const [instance] = await this.where({ [model.primaryKey]: id })

    if (!instance) {
      return null
    }

    return trackChanges<T>(instance)
  }

  static async findOrFail<T extends Model>(this: Constructor<T>, id: string | number): Promise<T> {
    /** @ts-ignore */
    const instance = await this.find(id)

    if (!instance) {
      throw new Error('Model not found.')
    }

    return instance
  }

  static async where<T extends Model>(this: Constructor<T>, attributes: object): Promise<T[]> {
    /** @ts-ignore */
    return await this.query(builder => builder.where(attributes))
  }

  static async all<T extends Model>(this: Constructor<T>, id: string | number): Promise<T[]> {
    /** @ts-ignore */
    return await this.query(builder => builder)
  }

  /**
   * !!! IMPORTANT !!!
   * For all queries, this should be the only method that interacts with Knex.
   * 
   * This method provides a flexible interface to add constraints to the underlying
   * QueryBuilder instance. It's also where soft-deletions are accounted for on the 
   * query side of things. Rather than implement that check in all the places, it's 
   * better to do it here, but that means that all "reads" need to point here.
   */
  static async query<T extends Model>(this: Constructor<T>, callback: (builder: Knex.QueryBuilder) => Knex.QueryBuilder): Promise<T[]> {
    Model.#internalConstructor = true
    const model = new this

    const builder = knex(model.tableName)

    if (model.softDeletes) {
      builder.whereNull(model.deletedAtColumn)
    }

    const records = await callback(builder)

    return records.map(record => {
      Model.#internalConstructor = true
      const instance = new this
      Object.seal(instance)
      Object.assign(instance, instance.deserialize(record))
      return trackChanges<T>(instance)
    })
  }

  async save(): Promise<void> {
    if (this.isClean()) {
      return
    }

    await knex(this.tableName)
      .where({ [this.primaryKey]: this[this.primaryKey] })
      .update(pick(this.serialize(), this.wasChanged()))

    this[$dirty as any].clear()
  }

  async delete(): Promise<void> {
    const builder = knex(this.tableName)
      .where({ [this.primaryKey]: this[this.primaryKey] })
    
    if (this.softDeletes) {
      const now = new Date()
      this[this.deletedAtColumn] = now
      builder.update({ [this.deletedAtColumn]: now })
    } else {
      builder.delete()
    }

    await builder
  }

  async forceDelete(): Promise<void> {
    await knex(this.tableName)
      .where({ [this.primaryKey]: this[this.primaryKey] })
      .delete()
  }

  async restore(): Promise<void> {
    if (!this.softDeletes) {
      return
    }

    this[this.deletedAtColumn] = null

    await knex(this.tableName)
      .where({ [this.primaryKey]: this[this.primaryKey] })
      .update({ [this.deletedAtColumn]: null })
  }

  static async delete(): Promise<void> {
    Model.#internalConstructor = true
    const model = new this

    await knex(model.tableName).delete()
  }

  static async restore(callback: (builder: Knex.QueryBuilder) => void): Promise<void> {
    Model.#internalConstructor = true
    const model = new this

    const query = knex(model.tableName)
    
    callback(query)

    await query.update({ [model.deletedAtColumn]: null })
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
      return trackChanges<T>(instance)
    })
  }

  protected async hasOne<T extends Model>(model: Constructor<T>, foreignKey?: string, localKey?: string): Promise<T> {
    let foreignTable: string

    if (this.models[model.name] === undefined) {
      throw new TypeError(`Invalid relationship model: ${model}`)
    }

    Model.#internalConstructor = true
    const foreignModel = new model
    foreignTable = foreignModel.tableName

    /**
     * User-provided `foreignKey` will be used if provided.
     * 
     * If `foreignKey` is undefined, we use a pluralization convention
     * to determine the foreign key on the joining table.
     * 
     * For example, if we have User.hasMany(Photo), then the foreign
     * key field name will be `photos.user_id`.
     */
    const fk = foreignKey || `${foreignTable}.${this.tableName}_id`
    const pk = localKey || this.primaryKey

    const [record] = await knex(foreignTable)
      .where({ [fk]: this[pk] })
      .limit(1)
  
    if (!record) {
      return null
    }

    Model.#internalConstructor = true
    const instance = new model
    Object.seal(instance)
    Object.assign(instance, instance.deserialize(record))
    return trackChanges<T>(instance)
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
    return trackChanges<T>(instance)
  }
}