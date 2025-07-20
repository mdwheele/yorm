import { v4 as uuidv4 } from 'uuid'
import { ulid } from 'ulid'
import crypto from 'crypto'
import type { Knex } from 'knex'
import { nanoid } from "nanoid"
import RelationshipManager from './RelationshipManager.js'
import QueryBuilder from './QueryBuilder.js'

// Types
export type KeyType = 'uuid' | 'ulid' | 'nanoid' | 'increments'
export type AttributeValue = string | number | boolean | Date | null | undefined | any[]
export type Attributes = Record<string, AttributeValue>

export interface ModelConstructor<T extends Model = Model> {
  new (attributes?: Attributes): T
  table?: string | null
  primaryKey: string
  keyType: KeyType
  timestamps: boolean
  softDeletes: boolean
  optimisticLocking: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string
  versionColumn: string
  hidden: string[]
  visible: string[]
  knex: Knex | null
  configure(knexInstance: Knex): void
  getKnex(): Knex
  getTableName(): string
  getKeyName(): string
  generateKey(): string | null
  query(): any // QueryBuilder<T>
  all(): Promise<T[]>
  find(id: any): Promise<T | null>
  findOrFail(id: any): Promise<T>
  where(column: string, operator?: any, value?: any): any // QueryBuilder<T>
  whereIn(column: string, values: any[]): any // QueryBuilder<T>
  create(attributes: Attributes): Promise<T>
  firstOrCreate(attributes: Attributes, values?: Attributes): Promise<T>
  updateOrCreate(attributes: Attributes, values?: Attributes): Promise<T>
}

export interface Relationship<T extends Model = Model> {
  relationName?: string
  get(): Promise<T | T[] | null>
  first(): Promise<T | null>
  where(column: string, operator?: any, value?: any): Relationship<T>
  with(relations: string | string[] | Record<string, ((query: any) => void) | null>): Relationship<T>
  // Add promise-like behavior for direct calls
  then<TResult1 = T | T[] | null, TResult2 = never>(
    onfulfilled?: ((value: T | T[] | null) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2>
}

class Model {
  public attributes: Attributes = {}
  public original: Attributes = {}
  public relations: Record<string, any> = {}
  public exists: boolean = false
  public wasRecentlyCreated: boolean = false
  public timestamps: boolean
  public softDeletes: boolean
  public optimisticLocking: boolean

  // Static configuration properties
  public static table: string | null = null
  public static primaryKey: string = 'id'
  public static keyType: KeyType = 'increments'
  public static timestamps: boolean = true
  public static softDeletes: boolean = false
  public static optimisticLocking: boolean = false
  public static createdAt: string = 'created_at'
  public static updatedAt: string = 'updated_at'
  public static deletedAt: string = 'deleted_at'
  public static versionColumn: string = 'version'
  public static hidden: string[] = []
  public static visible: string[] = []

  // Knex instance - to be set by configure()
  public static knex: Knex | null = null

  // Transaction context - thread-local storage for current transaction
  private static _currentTransaction: Knex.Transaction | null = null

  constructor(attributes: Attributes = {}) {
    this.timestamps = (this.constructor as typeof Model).timestamps ?? true
    this.softDeletes = (this.constructor as typeof Model).softDeletes ?? false
    this.optimisticLocking = (this.constructor as typeof Model).optimisticLocking ?? false
    
    // Initialize declared fields and set up proxies
    this._initializeFields()
    
    this.fill(attributes)
    this.syncOriginal()
  }

  // Configure the Knex instance for all models
  public static configure(knexInstance: Knex): void {
    Model.knex = knexInstance
  }

  // Get the configured Knex instance
  public static getKnex(): Knex {
    if (this._currentTransaction) {
      return this._currentTransaction
    }
    
    if (!Model.knex) {
      throw new Error('Model not configured. Call Model.configure(knexInstance) first.')
    }
    return Model.knex
  }

  /**
   * Execute a callback within a database transaction
   */
  public static async transaction<T>(callback: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    const knex = Model.knex
    if (!knex) {
      throw new Error('Model not configured. Call Model.configure(knexInstance) first.')
    }

    return await knex.transaction(async (trx: Knex.Transaction) => {
      // Store previous transaction context
      const previousTransaction = this._currentTransaction
      
      // Set new transaction context
      this._currentTransaction = trx

      try {
        const result = await callback(trx)
        return result
      } finally {
        // Restore previous transaction context
        this._currentTransaction = previousTransaction
      }
    })
  }

  // Table name mapping
  public static getTableName(): string {
    if (this.table) {
      return this.table
    }
    
    // Convert PascalCase to snake_case and pluralize
    const className = this.name
    const snakeCase = className
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .substring(1)
    
    // Simple pluralization rules
    if (snakeCase.endsWith('y')) {
      return snakeCase.slice(0, -1) + 'ies'
    } else if (snakeCase.endsWith('s') || snakeCase.endsWith('sh') || snakeCase.endsWith('ch')) {
      return snakeCase + 'es'
    } else {
      return snakeCase + 's'
    }
  }

  public getTableName(): string {
    return (this.constructor as typeof Model).getTableName()
  }

  // Field initialization and proxy setup
  private _initializeFields(): void {
    // Get all declared fields from the class prototype
    const declaredFields = this._getDeclaredFields()
    
    // Set up getters and setters for each declared field
    for (const fieldName of declaredFields) {
      // Always create/recreate the proxy to ensure it works properly
      this._createFieldProxy(fieldName)
    }
  }

  private _getDeclaredFields(): string[] {
    const fields = new Set<string>()
    
    // Get all own property names from the instance
    // This will include any declared fields that were set during construction
    const ownProps = Object.getOwnPropertyNames(this)
    for (const prop of ownProps) {
      if (!prop.startsWith('_') && 
          prop !== 'attributes' && 
          prop !== 'original' && 
          prop !== 'relations' && 
          prop !== 'exists' && 
          prop !== 'wasRecentlyCreated' && 
          prop !== 'timestamps' && 
          prop !== 'softDeletes' && 
          prop !== 'optimisticLocking') {
        fields.add(prop)
      }
    }

    // Include common fields that should always be available
    fields.add(this.getKeyName())
    if (this.timestamps) {
      fields.add(this.getCreatedAtColumn())
      fields.add(this.getUpdatedAtColumn())
    }
    if (this.usesSoftDeletes()) {
      fields.add(this.getDeletedAtColumn())
    }
    if (this.usesOptimisticLocking()) {
      fields.add(this.getVersionColumn())
    }

    // Also include any attributes that are already set
    for (const key of Object.keys(this.attributes)) {
      fields.add(key)
    }

    return Array.from(fields)
  }

  private _createFieldProxy(fieldName: string): void {
    Object.defineProperty(this, fieldName, {
      get() {
        return this.getAttribute(fieldName)
      },
      set(value: AttributeValue) {
        this.setAttribute(fieldName, value)
      },
      enumerable: true,
      configurable: true
    })
  }

  // Key management
  public static getKeyName(): string {
    return this.primaryKey
  }

  public getKeyName(): string {
    return (this.constructor as typeof Model).getKeyName()
  }

  public getKey(): AttributeValue {
    return this.getAttribute(this.getKeyName())
  }

  // UUID/ULID generation
  public static generateKey(): string | null {
    switch (this.keyType) {
      case 'uuid':
        return uuidv4()
      case 'ulid':
        return ulid()
      case 'nanoid':
        return nanoid()
      default:
        return null // Let database handle auto-increment
    }
  }

  // Attribute management
  public fill(attributes: Attributes): this {
    for (const [key, value] of Object.entries(attributes)) {
      this.setAttribute(key, value)
    }
    return this
  }

  public getAttribute(key: string): AttributeValue {
    // Check for custom getter
    const getter = (this as any)[`get${this._studlyCase(key)}Attribute`]
    if (typeof getter === 'function') {
      return getter.call(this)
    }

    // Return from attributes
    return this.attributes[key]
  }

  public setAttribute(key: string, value: AttributeValue): this {
    // Check for custom setter
    const setter = (this as any)[`set${this._studlyCase(key)}Attribute`]
    if (typeof setter === 'function') {
      setter.call(this, value)
      return this
    }

    // Set to attributes
    this.attributes[key] = value
    return this
  }

  // Convert snake_case to StudlyCase
  private _studlyCase(str: string): string {
    return str
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('')
  }

  // Property access
  public get(key: string): AttributeValue {
    return this.getAttribute(key)
  }

  public set(key: string, value: AttributeValue): this {
    return this.setAttribute(key, value)
  }

  // Change tracking
  public isDirty(attributes?: string | string[] | null): boolean {
    if (attributes) {
      const attrs = Array.isArray(attributes) ? attributes : [attributes]
      return attrs.some(attr => this.attributes[attr] !== this.original[attr])
    }
    
    return Object.keys(this.attributes).some(key => 
      this.attributes[key] !== this.original[key]
    )
  }

  public isClean(attributes?: string | string[] | null): boolean {
    return !this.isDirty(attributes)
  }

  public getDirty(): Attributes {
    const dirty: Attributes = {}
    for (const [key, value] of Object.entries(this.attributes)) {
      if (value !== this.original[key]) {
        dirty[key] = value
      }
    }
    return dirty
  }

  public getChanges(): Attributes {
    return this.getDirty()
  }

  public syncOriginal(): this {
    this.original = { ...this.attributes }
    return this
  }

  // Timestamps
  public usesSoftDeletes(): boolean {
    return this.softDeletes
  }

  public getCreatedAtColumn(): string {
    return (this.constructor as typeof Model).createdAt
  }

  public getUpdatedAtColumn(): string {
    return (this.constructor as typeof Model).updatedAt
  }

  public getDeletedAtColumn(): string {
    return (this.constructor as typeof Model).deletedAt
  }

  public touch(): this {
    if (this.timestamps) {
      const now = new Date()
      this.setAttribute(this.getUpdatedAtColumn(), now)
    }
    return this
  }

  // Optimistic locking
  public usesOptimisticLocking(): boolean {
    return this.optimisticLocking
  }

  public getVersionColumn(): string {
    return (this.constructor as typeof Model).versionColumn
  }

  public generateETag(): string {
    const data = JSON.stringify(this.attributes)
    return crypto.createHash('md5').update(data).digest('hex')
  }

  // Serialization
  public toJSON(): Attributes {
    const attributes: Attributes = { ...this.attributes }
    
    // Add relations
    for (const [key, relation] of Object.entries(this.relations)) {
      if (relation && typeof relation.toJSON === 'function') {
        attributes[key] = relation.toJSON()
      } else if (Array.isArray(relation)) {
        attributes[key] = relation.map(r => r && typeof r.toJSON === 'function' ? r.toJSON() : r)
      } else {
        attributes[key] = relation
      }
    }

    const constructor = this.constructor as typeof Model
    
    // Apply visibility rules
    if (constructor.visible.length > 0) {
      const visible: Attributes = {}
      for (const key of constructor.visible) {
        if (key in attributes) {
          visible[key] = attributes[key]
        }
      }
      return visible
    }

    // Apply hidden rules
    for (const key of constructor.hidden) {
      delete attributes[key]
    }

    return attributes
  }

  // Database operations
  public async save(): Promise<this> {
    if (this.exists) {
      return this.performUpdate()
    } else {
      return this.performInsert()
    }
  }

  private async performInsert(): Promise<this> {
    const attributes: Attributes = { ...this.attributes }
    const constructor = this.constructor as typeof Model

    // Generate primary key if needed
    if (!attributes[this.getKeyName()] && constructor.keyType !== 'increments') {
      attributes[this.getKeyName()] = constructor.generateKey()
    }

    // Add timestamps
    if (this.timestamps) {
      const now = new Date()
      attributes[this.getCreatedAtColumn()] = now
      attributes[this.getUpdatedAtColumn()] = now
    }

    // Add version for optimistic locking
    if (this.usesOptimisticLocking()) {
      attributes[this.getVersionColumn()] = 1
    }

    const knex = Model.getKnex()
    const result = await knex(this.getTableName()).insert(attributes)

    // Handle auto-increment keys
    if (constructor.keyType === 'increments' && result[0]) {
      attributes[this.getKeyName()] = result[0]
      // Also set it directly on the instance to ensure proxy works
      this.setAttribute(this.getKeyName(), result[0])
    }

    this.attributes = attributes
    this.exists = true
    this.wasRecentlyCreated = true
    this.syncOriginal()

    return this
  }

  private async performUpdate(): Promise<this> {
    const dirty = this.getDirty()
    
    if (Object.keys(dirty).length === 0) {
      return this
    }

    // Add updated timestamp
    if (this.timestamps) {
      dirty[this.getUpdatedAtColumn()] = new Date()
    }

    const knex = Model.getKnex()
    let query = knex(this.getTableName()).where(this.getKeyName(), this.getKey())

    // Optimistic locking check
    if (this.usesOptimisticLocking() && this.original[this.getVersionColumn()]) {
      query = query.where(this.getVersionColumn(), this.original[this.getVersionColumn()])
      dirty[this.getVersionColumn()] = (this.original[this.getVersionColumn()] as number) + 1
    }

    const affectedRows = await query.update(dirty)

    if (affectedRows === 0 && this.usesOptimisticLocking()) {
      throw new Error('Optimistic locking failed. The record has been modified by another process.')
    }

    // Update local attributes
    Object.assign(this.attributes, dirty)
    this.syncOriginal()

    return this
  }

  public async delete(): Promise<boolean> {
    if (!this.exists) {
      return false
    }

    if (this.usesSoftDeletes()) {
      return this.performSoftDelete()
    } else {
      return this.performDelete()
    }
  }

  private async performSoftDelete(): Promise<boolean> {
    const attributes: Attributes = {}
    attributes[this.getDeletedAtColumn()] = new Date()
    
    if (this.timestamps) {
      attributes[this.getUpdatedAtColumn()] = new Date()
    }

    Object.assign(this.attributes, attributes)
    await this.performUpdate()
    
    return true
  }

  private async performDelete(): Promise<boolean> {
    const knex = Model.getKnex()
    const affectedRows = await knex(this.getTableName())
      .where(this.getKeyName(), this.getKey())
      .del()

    if (affectedRows > 0) {
      this.exists = false
      return true
    }

    return false
  }

  public async restore(): Promise<this> {
    if (!this.usesSoftDeletes()) {
      throw new Error('Model does not use soft deletes')
    }

    this.setAttribute(this.getDeletedAtColumn(), null)
    return this.save()
  }

  public async forceDelete(): Promise<boolean> {
    if (!this.exists) {
      return false
    }

    const knex = Model.getKnex()
    const affectedRows = await knex(this.getTableName())
      .where(this.getKeyName(), this.getKey())
      .del()

    if (affectedRows > 0) {
      this.exists = false
      return true
    }

    return false
  }

  // Relationships
  public setRelation(relation: string, value: any): this {
    this.relations[relation] = value
    return this
  }

  public getRelation(relation: string): any {
    return this.relations[relation]
  }

  /**
   * Load relationships for this model instance
   */
  public async load(relations: string | string[] | Record<string, ((query: any) => void) | null>): Promise<this> {
    const relationNames = this._normalizeRelations(relations)
    
    for (const [relationName, callback] of Object.entries(relationNames)) {
      await this._loadSingleRelation(relationName, callback)
    }
    
    return this
  }

  /**
   * Load a single relationship, handling nested relationships
   */
  private async _loadSingleRelation(relationPath: string, callback: ((query: any) => void) | null): Promise<void> {
    // Handle nested relationships like 'comments.author'
    if (relationPath.includes('.')) {
      const [parentRelation, childRelation] = relationPath.split('.', 2)
      
      // First load the parent relationship
      await this._loadDirectRelation(parentRelation, null)
      
      // Then load the child relationship on the loaded parent data
      const parentData = this.getRelation(parentRelation)
      if (parentData) {
        if (Array.isArray(parentData)) {
          // For hasMany relationships, load child relation for each item
          for (const item of parentData) {
            if (item && typeof item.load === 'function') {
              await item.load(childRelation)
            }
          }
        } else if (typeof parentData.load === 'function') {
          // For hasOne/belongsTo relationships
          await parentData.load(childRelation)
        }
      }
    } else {
      // Direct relationship
      await this._loadDirectRelation(relationPath, callback)
    }
  }

  /**
   * Load a direct (non-nested) relationship
   */
  private async _loadDirectRelation(relationName: string, callback: ((query: any) => void) | null): Promise<void> {
    // Check if the model has this relationship method
    const relationMethod = (this as any)[relationName]
    if (typeof relationMethod === 'function') {
      let relationship = relationMethod.call(this)
      
      // Apply callback constraints if provided
      if (callback) {
        callback(relationship)
      }
      
      // Load the relationship data
      const relationData = await relationship.get()
      
      // Set the loaded relationship
      this.setRelation(relationName, relationData)
    } else {
      throw new Error(`Relationship '${relationName}' not found on model`)
    }
  }

  /**
   * Normalize relations input to a consistent format
   */
  private _normalizeRelations(relations: string | string[] | Record<string, ((query: any) => void) | null>): Record<string, ((query: any) => void) | null> {
    if (typeof relations === 'string') {
      return { [relations]: null }
    }
    
    if (Array.isArray(relations)) {
      const normalized: Record<string, ((query: any) => void) | null> = {}
      for (const relation of relations) {
        normalized[relation] = null
      }
      return normalized
    }
    
    return relations
  }

  /**
   * Load relationships for multiple model instances (for eager loading)
   */
  public static async loadRelationsForModels<T extends Model>(
    models: T[], 
    relations: string | string[] | Record<string, ((query: any) => void) | null>
  ): Promise<void> {
    if (models.length === 0) return
    
    const relationNames = models[0]._normalizeRelations(relations)
    
    for (const [relationName, callback] of Object.entries(relationNames)) {
      await RelationshipManager.eagerLoad(models, relationName, callback || undefined)
    }
  }

  // Relationship methods (to be overridden in subclasses)
  public hasOne<T extends Model>(related: ModelConstructor<T>, foreignKey?: string | null, localKey?: string | null): Relationship<T> {
    const relationship = RelationshipManager.hasOne(this, related, foreignKey, localKey)
    relationship.relationName = this._getCallerMethodName()
    return relationship
  }

  public hasMany<T extends Model>(related: ModelConstructor<T>, foreignKey?: string | null, localKey?: string | null): Relationship<T> {
    const relationship = RelationshipManager.hasMany(this, related, foreignKey, localKey)
    relationship.relationName = this._getCallerMethodName()
    return relationship
  }

  public belongsTo<T extends Model>(related: ModelConstructor<T>, foreignKey?: string | null, ownerKey?: string | null): Relationship<T> {
    const relationship = RelationshipManager.belongsTo(this, related, foreignKey, ownerKey)
    relationship.relationName = this._getCallerMethodName()
    return relationship
  }

  public belongsToMany<T extends Model>(
    related: ModelConstructor<T>, 
    table?: string | null, 
    foreignPivotKey?: string | null, 
    relatedPivotKey?: string | null, 
    parentKey?: string | null, 
    relatedKey?: string | null
  ): Relationship<T> {
    const relationship = RelationshipManager.belongsToMany(this, related, table, foreignPivotKey, relatedPivotKey, parentKey, relatedKey)
    relationship.relationName = this._getCallerMethodName()
    return relationship
  }

  private _getCallerMethodName(): string {
    const stack = new Error().stack
    if (!stack) return 'unknown'
    const callerLine = stack.split('\n')[3]
    const match = callerLine.match(/at (\w+)/)
    return match ? match[1] : 'unknown'
  }

  // Static query methods
  /**
   * Create a new query builder for this model
   */
  public static query<T extends Model>(this: ModelConstructor<T>): any {
    return new QueryBuilder(new this(), this.getKnex())
  }

  /**
   * Get all models from the database
   */
  public static all<T extends Model>(this: ModelConstructor<T>): Promise<T[]> {
    return this.query().get()
  }

  /**
   * Find a model by its primary key
   */
  public static find<T extends Model>(this: ModelConstructor<T>, id: any): Promise<T | null> {
    return this.query().find(id)
  }

  /**
   * Find a model by its primary key or throw an error
   */
  public static findOrFail<T extends Model>(this: ModelConstructor<T>, id: any): Promise<T> {
    return this.query().findOrFail(id)
  }

  /**
   * Add a where clause to the query
   */
  public static where<T extends Model>(this: ModelConstructor<T>, column: string, operator?: any, value?: any): any {
    if (arguments.length === 2) {
      return this.query().where(column, operator)
    } else {
      return this.query().where(column, operator, value)
    }
  }

  /**
   * Add a whereIn clause to the query
   */
  public static whereIn<T extends Model>(this: ModelConstructor<T>, column: string, values: any[]): any {
    return this.query().whereIn(column, values)
  }

  /**
   * Create a new model instance and save it to the database
   */
  public static create<T extends Model>(this: ModelConstructor<T>, attributes: Attributes): Promise<T> {
    const instance = new this(attributes)
    return instance.save()
  }

  public static async firstOrCreate<T extends Model>(this: ModelConstructor<T>, attributes: Attributes, values: Attributes = {}): Promise<T> {
    // For complex where clauses with multiple attributes, we need to build the query manually
    let query = this.query()
    for (const [key, value] of Object.entries(attributes)) {
      query = query.where(key, value)
    }
    const instance = await query.first()
    if (instance) {
      return instance
    }

    return this.create({ ...attributes, ...values })
  }

  public static async updateOrCreate<T extends Model>(this: ModelConstructor<T>, attributes: Attributes, values: Attributes = {}): Promise<T> {
    // For complex where clauses with multiple attributes, we need to build the query manually
    let query = this.query()
    for (const [key, value] of Object.entries(attributes)) {
      query = query.where(key, value)
    }
    const instance = await query.first()
    if (instance) {
      instance.fill(values)
      await instance.save()
      return instance
    }

    return this.create({ ...attributes, ...values })
  }

  // Instance methods
  public newQuery(): any {
    return new QueryBuilder(this, Model.getKnex())
  }

  public newFromBuilder(attributes: Attributes): this {
    const constructor = this.constructor as ModelConstructor<this>
    const instance = new constructor()
    instance.attributes = attributes
    instance.original = { ...attributes }
    instance.exists = true
    
    // Ensure all attribute keys have proxies
    for (const key of Object.keys(attributes)) {
      instance._createFieldProxy(key)
    }
    
    // Also ensure common fields have proxies
    instance._createFieldProxy(instance.getKeyName())
    if (instance.timestamps) {
      instance._createFieldProxy(instance.getCreatedAtColumn())
      instance._createFieldProxy(instance.getUpdatedAtColumn())
    }
    
    return instance
  }

  // Refresh from database
  public async refresh(): Promise<this> {
    if (!this.exists) {
      throw new Error('Cannot refresh a model that does not exist in the database')
    }

    const constructor = this.constructor as ModelConstructor<this>
    const fresh = await constructor.find(this.getKey())
    if (!fresh) {
      throw new Error('Model not found in database')
    }

    this.attributes = fresh.attributes
    this.original = fresh.original
    this.relations = {}

    return this
  }

  // Clone instance
  public replicate(except: string[] = []): this {
    const attributes: Attributes = { ...this.attributes }
    
    // Remove primary key and specified exceptions
    delete attributes[this.getKeyName()]
    for (const key of except) {
      delete attributes[key]
    }

    const constructor = this.constructor as ModelConstructor<this>
    const instance = new constructor(attributes)
    instance.exists = false
    instance.wasRecentlyCreated = false

    return instance
  }
}

export default Model
