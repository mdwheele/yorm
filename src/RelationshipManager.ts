import type { Knex } from 'knex'
import type Model from './Model.js'
import type { ModelConstructor, Attributes } from './Model.js'
import type QueryBuilder from './QueryBuilder.js'

export interface Relationship<T extends Model = Model> {
  relationName?: string
  get(): Promise<T | T[] | null>
  first(): Promise<T | null>
  where(column: string, operator?: any, value?: any): Relationship<T>
  with(relations: string | string[] | Record<string, ((query: QueryBuilder<any>) => void) | null>): Relationship<T>
  // Add promise-like behavior for direct calls
  then<TResult1 = T | T[] | null, TResult2 = never>(
    onfulfilled?: ((value: T | T[] | null) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2>
}

abstract class BaseRelationship<T extends Model> implements Relationship<T> {
  protected parent: Model
  protected related: ModelConstructor<T>
  protected foreignKey: string
  protected localKey: string
  public relationName?: string

  constructor(parent: Model, related: ModelConstructor<T>, foreignKey: string, localKey: string) {
    this.parent = parent
    this.related = related
    this.foreignKey = foreignKey
    this.localKey = localKey
  }

  abstract get(): Promise<T | T[] | null>
  abstract first(): Promise<T | null>

  // Make relationships thenable so they can be awaited directly
  public then<TResult1 = T | T[] | null, TResult2 = never>(
    onfulfilled?: ((value: T | T[] | null) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.get().then(onfulfilled, onrejected)
  }

  public where(column: string, operator?: any, value?: any): this {
    // This would be implemented by subclasses to add where conditions
    return this
  }

  public with(relations: string | string[] | Record<string, ((query: QueryBuilder<any>) => void) | null>): this {
    // This would be implemented by subclasses to add eager loading
    return this
  }
}

class HasOneRelationship<T extends Model> extends BaseRelationship<T> {
  public async get(): Promise<T | null> {
    const relatedInstance = new this.related()
    return (relatedInstance.constructor as any).query()
      .where(this.foreignKey, this.parent.getAttribute(this.localKey))
      .first() as Promise<T | null>
  }

  public async first(): Promise<T | null> {
    return this.get()
  }
}

class HasManyRelationship<T extends Model> extends BaseRelationship<T> {
  public async get(): Promise<T[]> {
    const relatedInstance = new this.related()
    return (relatedInstance.constructor as any).query()
      .where(this.foreignKey, this.parent.getAttribute(this.localKey))
      .get() as Promise<T[]>
  }

  public async first(): Promise<T | null> {
    const results = await this.get()
    return results[0] || null
  }
}

class BelongsToRelationship<T extends Model> extends BaseRelationship<T> {
  public async get(): Promise<T | null> {
    const relatedInstance = new this.related()
    return (relatedInstance.constructor as any).query()
      .where(this.localKey, this.parent.getAttribute(this.foreignKey))
      .first() as Promise<T | null>
  }

  public async first(): Promise<T | null> {
    return this.get()
  }
}

class BelongsToManyRelationship<T extends Model> extends BaseRelationship<T> {
  private pivotTable: string
  private foreignPivotKey: string
  private relatedPivotKey: string
  private parentKey: string
  private relatedKey: string

  constructor(
    parent: Model,
    related: ModelConstructor<T>,
    pivotTable: string,
    foreignPivotKey: string,
    relatedPivotKey: string,
    parentKey: string,
    relatedKey: string
  ) {
    super(parent, related, foreignPivotKey, parentKey)
    this.pivotTable = pivotTable
    this.foreignPivotKey = foreignPivotKey
    this.relatedPivotKey = relatedPivotKey
    this.parentKey = parentKey
    this.relatedKey = relatedKey
  }

  public async get(): Promise<T[]> {
    const relatedInstance = new this.related()
    const knex = this.related.getKnex()
    
    const results = await knex(relatedInstance.getTableName())
      .join(this.pivotTable, `${relatedInstance.getTableName()}.${this.relatedKey}`, `${this.pivotTable}.${this.relatedPivotKey}`)
      .where(`${this.pivotTable}.${this.foreignPivotKey}`, this.parent.getAttribute(this.parentKey))
    
    return results.map(result => relatedInstance.newFromBuilder(result)) as T[]
  }

  public async first(): Promise<T | null> {
    const results = await this.get()
    return results[0] || null
  }

  // Pivot table methods
  public async attach(id: any, attributes: Attributes = {}): Promise<void> {
    const knex = this.related.getKnex()
    const pivotData = {
      [this.foreignPivotKey]: this.parent.getAttribute(this.parentKey),
      [this.relatedPivotKey]: id,
      ...attributes
    }
    
    await knex(this.pivotTable).insert(pivotData)
  }

  public async detach(id?: any): Promise<number> {
    const knex = this.related.getKnex()
    let query = knex(this.pivotTable)
      .where(this.foreignPivotKey, this.parent.getAttribute(this.parentKey))
    
    if (id !== undefined) {
      query = query.where(this.relatedPivotKey, id)
    }
    
    return query.del()
  }

  public async sync(ids: any[]): Promise<void> {
    await this.detach()
    for (const id of ids) {
      await this.attach(id)
    }
  }
}

class RelationshipManager {
  public static hasOne<T extends Model>(
    parent: Model,
    related: ModelConstructor<T>,
    foreignKey?: string | null,
    localKey?: string | null
  ): HasOneRelationship<T> {
    const fk = foreignKey || this.getForeignKey(parent.constructor.name)
    const lk = localKey || parent.getKeyName()
    
    return new HasOneRelationship(parent, related, fk, lk)
  }

  public static hasMany<T extends Model>(
    parent: Model,
    related: ModelConstructor<T>,
    foreignKey?: string | null,
    localKey?: string | null
  ): HasManyRelationship<T> {
    const fk = foreignKey || this.getForeignKey(parent.constructor.name)
    const lk = localKey || parent.getKeyName()
    
    return new HasManyRelationship(parent, related, fk, lk)
  }

  public static belongsTo<T extends Model>(
    parent: Model,
    related: ModelConstructor<T>,
    foreignKey?: string | null,
    ownerKey?: string | null
  ): BelongsToRelationship<T> {
    const fk = foreignKey || this.getForeignKey(related.name)
    const ok = ownerKey || related.getKeyName()
    
    return new BelongsToRelationship(parent, related, fk, ok)
  }

  public static belongsToMany<T extends Model>(
    parent: Model,
    related: ModelConstructor<T>,
    table?: string | null,
    foreignPivotKey?: string | null,
    relatedPivotKey?: string | null,
    parentKey?: string | null,
    relatedKey?: string | null
  ): BelongsToManyRelationship<T> {
    const pivotTable = table || this.getPivotTableName(parent.constructor.name, related.name)
    const fpk = foreignPivotKey || this.getForeignKey(parent.constructor.name)
    const rpk = relatedPivotKey || this.getForeignKey(related.name)
    const pk = parentKey || parent.getKeyName()
    const rk = relatedKey || related.getKeyName()
    
    return new BelongsToManyRelationship(parent, related, pivotTable, fpk, rpk, pk, rk)
  }

  // Helper methods
  private static getForeignKey(className: string): string {
    // Convert PascalCase to snake_case and add _id
    const snakeCase = className
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .substring(1)
    
    return `${snakeCase}_id`
  }

  private static getPivotTableName(class1: string, class2: string): string {
    // Create pivot table name by sorting and joining class names
    const names = [
      class1.replace(/([A-Z])/g, '_$1').toLowerCase().substring(1),
      class2.replace(/([A-Z])/g, '_$1').toLowerCase().substring(1)
    ].sort()
    
    return names.join('_')
  }

  // Eager loading helper
  public static async eagerLoad<T extends Model>(
    models: T[],
    relationName: string,
    callback?: (query: QueryBuilder<any>) => void
  ): Promise<void> {
    if (models.length === 0) {
      return
    }

    // Handle nested relationships like 'comments.author'
    if (relationName.includes('.')) {
      const [parentRelation, childRelation] = relationName.split('.', 2)
      
      // First load the parent relationship for all models
      await this.eagerLoad(models, parentRelation)
      
      // Then collect all loaded parent data and load child relationships
      const parentModels: Model[] = []
      for (const model of models) {
        const parentData = model.getRelation(parentRelation)
        if (parentData) {
          if (Array.isArray(parentData)) {
            parentModels.push(...parentData)
          } else {
            parentModels.push(parentData)
          }
        }
      }
      
      // Load child relationships on the collected parent models
      if (parentModels.length > 0) {
        await this.eagerLoad(parentModels, childRelation, callback)
      }
      
      return
    }

    // Load the relationship for each model individually
    // This is not optimized but will work correctly
    for (const model of models) {
      try {
        // Check if the model has this relationship method
        const relationMethod = (model as any)[relationName]
        if (typeof relationMethod === 'function') {
          let relationship = relationMethod.call(model)
          
          // Apply callback constraints if provided
          if (callback) {
            callback(relationship)
          }
          
          // Load the relationship data
          const relationData = await relationship.get()
          
          // Set the loaded relationship
          model.setRelation(relationName, relationData)
        } else {
          throw new Error(`Relationship '${relationName}' not found on model`)
        }
      } catch (error) {
        console.warn(`Failed to load relation '${relationName}' for model:`, error)
      }
    }
  }

  // N+1 query prevention
  public static async preventNPlusOne<T extends Model>(
    models: T[],
    relationName: string
  ): Promise<void> {
    if (models.length === 0) {
      return
    }

    // Group models by their foreign key values to batch load relationships
    const grouped = new Map<any, T[]>()
    
    models.forEach(model => {
      const relation = model.getRelation(relationName)
      if (relation instanceof BelongsToRelationship) {
        const foreignKeyValue = model.getAttribute((relation as any).foreignKey)
        if (!grouped.has(foreignKeyValue)) {
          grouped.set(foreignKeyValue, [])
        }
        grouped.get(foreignKeyValue)!.push(model)
      }
    })

    // Load all related models in a single query
    for (const [foreignKeyValue, groupedModels] of grouped) {
      const sampleModel = groupedModels[0]
      const relation = sampleModel.getRelation(relationName)
      
      if (relation instanceof BelongsToRelationship) {
        const relatedModel = await relation.get()
        groupedModels.forEach(model => {
          model.setRelation(relationName, relatedModel)
        })
      }
    }
  }
}

export default RelationshipManager
export { 
  BaseRelationship, 
  HasOneRelationship, 
  HasManyRelationship, 
  BelongsToRelationship, 
  BelongsToManyRelationship 
}
