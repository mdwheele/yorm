import type { Knex } from 'knex'
import type Model from './Model.js'
import type { ModelConstructor, Attributes, AttributeValue } from './Model.js'

export interface EagerLoadOptions {
  [key: string]: ((query: QueryBuilder<any>) => void) | null
}

class QueryBuilder<T extends Model> {
  private model: T
  private knex: Knex
  private query: Knex.QueryBuilder
  private eagerLoads: EagerLoadOptions = {}

  constructor(model: T, knex: Knex) {
    this.model = model
    this.knex = knex
    this.query = knex(model.getTableName())
    
    // Apply soft delete constraints by default
    if (model.usesSoftDeletes()) {
      this.query.whereNull(model.getDeletedAtColumn())
    }
  }

  // Query building methods
  public select(...columns: string[]): this {
    this.query.select(...columns)
    return this
  }

  public where(column: string, operator: any, value?: any): this {
    if (arguments.length === 2) {
      this.query.where(column, operator)
    } else {
      this.query.where(column, operator, value)
    }
    return this
  }

  public orWhere(column: string, operator: any, value?: any): this {
    if (arguments.length === 2) {
      this.query.orWhere(column, operator)
    } else {
      this.query.orWhere(column, operator, value)
    }
    return this
  }

  public whereIn(column: string, values: any[]): this {
    this.query.whereIn(column, values)
    return this
  }

  public whereNotIn(column: string, values: any[]): this {
    this.query.whereNotIn(column, values)
    return this
  }

  public whereNull(column: string): this {
    this.query.whereNull(column)
    return this
  }

  public whereNotNull(column: string): this {
    this.query.whereNotNull(column)
    return this
  }

  public whereBetween(column: string, range: [any, any]): this {
    this.query.whereBetween(column, range)
    return this
  }

  public whereNotBetween(column: string, range: [any, any]): this {
    this.query.whereNotBetween(column, range)
    return this
  }

  public join(table: string, first: string, operator?: string, second?: string): this {
    if (operator && second) {
      this.query.join(table, first, operator, second)
    } else {
      this.query.join(table, first, operator || '=')
    }
    return this
  }

  public leftJoin(table: string, first: string, operator?: string, second?: string): this {
    if (operator && second) {
      this.query.leftJoin(table, first, operator, second)
    } else {
      this.query.leftJoin(table, first, operator || '=')
    }
    return this
  }

  public rightJoin(table: string, first: string, operator?: string, second?: string): this {
    if (operator && second) {
      this.query.rightJoin(table, first, operator, second)
    } else {
      this.query.rightJoin(table, first, operator || '=')
    }
    return this
  }

  public innerJoin(table: string, first: string, operator?: string, second?: string): this {
    if (operator && second) {
      this.query.innerJoin(table, first, operator, second)
    } else {
      this.query.innerJoin(table, first, operator || '=')
    }
    return this
  }

  public groupBy(...columns: string[]): this {
    this.query.groupBy(...columns)
    return this
  }

  public having(column: string, operator?: any, value?: any): this {
    if (arguments.length === 2) {
      this.query.having(column, '=', operator)
    } else if (arguments.length === 3) {
      this.query.having(column, operator, value)
    }
    return this
  }

  public orderBy(column: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.query.orderBy(column, direction)
    return this
  }

  public latest(column?: string): this {
    const timestampColumn = column || this.model.getCreatedAtColumn()
    return this.orderBy(timestampColumn, 'desc')
  }

  public oldest(column?: string): this {
    const timestampColumn = column || this.model.getCreatedAtColumn()
    return this.orderBy(timestampColumn, 'asc')
  }

  public limit(count: number): this {
    this.query.limit(count)
    return this
  }

  public offset(count: number): this {
    this.query.offset(count)
    return this
  }

  public take(count: number): this {
    return this.limit(count)
  }

  public skip(count: number): this {
    return this.offset(count)
  }

  // Soft delete methods
  public withTrashed(): this {
    if (this.model.usesSoftDeletes()) {
      // Remove the default whereNull constraint
      this.query.clearWhere()
      // Re-add any conditions that were set before withTrashed
    }
    return this
  }

  public onlyTrashed(): this {
    if (this.model.usesSoftDeletes()) {
      this.query.whereNotNull(this.model.getDeletedAtColumn())
    }
    return this
  }

  // Eager loading
  public with(relations: string | string[] | EagerLoadOptions): this {
    if (typeof relations === 'string') {
      this.eagerLoads[relations] = null
    } else if (Array.isArray(relations)) {
      relations.forEach(relation => {
        this.eagerLoads[relation] = null
      })
    } else {
      Object.assign(this.eagerLoads, relations)
    }
    return this
  }

  // Execution methods
  public async get(): Promise<T[]> {
    const results = await this.query
    const models = results.map((result: any) => this.model.newFromBuilder(result))
    
    // Load eager relationships
    if (Object.keys(this.eagerLoads).length > 0) {
      await this.loadRelations(models)
    }
    
    return models
  }

  public async first(): Promise<T | null> {
    this.query.limit(1)
    const results = await this.get()
    return results[0] || null
  }

  public async firstOrFail(): Promise<T> {
    const result = await this.first()
    if (!result) {
      throw new Error('No query results for model')
    }
    return result
  }

  public async find(id: any): Promise<T | null> {
    return this.where(this.model.getKeyName(), id).first()
  }

  public async findOrFail(id: any): Promise<T> {
    const result = await this.find(id)
    if (!result) {
      throw new Error(`No query results for model with ID: ${id}`)
    }
    return result
  }

  public async findMany(ids: any[]): Promise<T[]> {
    return this.whereIn(this.model.getKeyName(), ids).get()
  }

  // Aggregation methods
  public async count(column: string = '*'): Promise<number> {
    const result = await this.query.count(`${column} as count`)
    return parseInt((result[0] as any).count, 10)
  }

  public async max(column: string): Promise<number> {
    const result = await this.query.max(`${column} as max`)
    return (result[0] as any).max
  }

  public async min(column: string): Promise<number> {
    const result = await this.query.min(`${column} as min`)
    return (result[0] as any).min
  }

  public async avg(column: string): Promise<number> {
    const result = await this.query.avg(`${column} as avg`)
    return parseFloat((result[0] as any).avg)
  }

  public async sum(column: string): Promise<number> {
    const result = await this.query.sum(`${column} as sum`)
    return parseFloat((result[0] as any).sum)
  }

  public async exists(): Promise<boolean> {
    const count = await this.count()
    return count > 0
  }

  public async doesntExist(): Promise<boolean> {
    return !(await this.exists())
  }

  // Pagination
  public async paginate(page: number = 1, perPage: number = 15): Promise<{
    data: T[]
    total: number
    per_page: number
    current_page: number
    last_page: number
    from: number
    to: number
  }> {
    const total = await this.count()
    const results = await this.offset((page - 1) * perPage).limit(perPage).get()
    
    return {
      data: results,
      total,
      per_page: perPage,
      current_page: page,
      last_page: Math.ceil(total / perPage),
      from: (page - 1) * perPage + 1,
      to: Math.min(page * perPage, total)
    }
  }

  // Update/Delete operations
  public async update(attributes: Attributes): Promise<number> {
    // Add updated timestamp if model uses timestamps
    if (this.model.timestamps) {
      attributes[this.model.getUpdatedAtColumn()] = new Date()
    }
    
    return this.query.update(attributes)
  }

  public async delete(): Promise<number> {
    if (this.model.usesSoftDeletes()) {
      const attributes: Attributes = {}
      attributes[this.model.getDeletedAtColumn()] = new Date()
      
      if (this.model.timestamps) {
        attributes[this.model.getUpdatedAtColumn()] = new Date()
      }
      
      return this.update(attributes)
    } else {
      return this.query.del()
    }
  }

  public async forceDelete(): Promise<number> {
    return this.query.del()
  }

  public async restore(): Promise<number> {
    if (!this.model.usesSoftDeletes()) {
      throw new Error('Model does not use soft deletes')
    }
    
    const attributes: Attributes = {}
    attributes[this.model.getDeletedAtColumn()] = null
    
    if (this.model.timestamps) {
      attributes[this.model.getUpdatedAtColumn()] = new Date()
    }
    
    return this.update(attributes)
  }

  // Chunk processing
  public async chunk(size: number, callback: (models: T[]) => Promise<boolean | void>): Promise<void> {
    let page = 1
    let shouldContinue = true
    
    while (shouldContinue) {
      const results = await this.offset((page - 1) * size).limit(size).get()
      
      if (results.length === 0) {
        break
      }
      
      const result = await callback(results)
      if (result === false) {
        break
      }
      
      if (results.length < size) {
        break
      }
      
      page++
    }
  }

  // Advanced features
  public toSql(): string {
    return this.query.toQuery()
  }

  public clone(): QueryBuilder<T> {
    const cloned = new QueryBuilder(this.model, this.knex)
    cloned.query = this.query.clone()
    cloned.eagerLoads = { ...this.eagerLoads }
    return cloned
  }

  // Load eager relationships
  private async loadRelations(models: T[]): Promise<void> {
    if (models.length === 0) {
      return
    }

    for (const [relationName, callback] of Object.entries(this.eagerLoads)) {
      await this.loadRelation(models, relationName, callback)
    }
  }

  private async loadRelation(models: T[], relationName: string, callback: ((query: QueryBuilder<any>) => void) | null): Promise<void> {
    // Use the Model's loadRelationsForModels method which properly handles relationship loading
    const relationMap: { [key: string]: ((query: any) => void) | null } = {}
    relationMap[relationName] = callback
    
    const Model = (await import('./Model.js')).default
    await Model.loadRelationsForModels(models, relationMap)
  }

  // Raw queries
  public raw(sql: string, bindings?: any[]): Knex.Raw {
    return bindings ? this.knex.raw(sql, bindings) : this.knex.raw(sql)
  }

  // Transaction support
  public async transaction<R>(callback: (trx: Knex.Transaction) => Promise<R>): Promise<R> {
    return this.knex.transaction(callback)
  }

  // Scope methods (for custom query scopes)
  public scope(scopeName: string, ...args: any[]): this {
    const constructor = this.model.constructor as any
    const scopeMethod = constructor[`scope${scopeName.charAt(0).toUpperCase() + scopeName.slice(1)}`]
    
    if (typeof scopeMethod === 'function') {
      scopeMethod.call(constructor, this, ...args)
    } else {
      throw new Error(`Scope '${scopeName}' not found on model`)
    }
    
    return this
  }
}

export default QueryBuilder
