import { Model } from './Model'

export * from './Model'

export async function transaction(...args: any[]) {
  if (args.length < 2) {
    throw new Error(`You must provide at least one Model class to bind to the transaction.`)
  }

  const callback = args[args.length - 1]
  const modelClasses = args.slice(0, args.length - 1)

  for (let i = 0; i < modelClasses.length; i++) {
    if (!(modelClasses[i].prototype instanceof Model)) {
      throw new Error(`All but the last argument of transaction should be Model instances`)
    }
  }

  const knex = modelClasses[0].knex

  for (let i = 0; i < modelClasses.length; i++) {
    if (modelClasses[i].knex !== knex) {
      throw new Error(`All Model instances must be bound to the same database.`)
    }
  }

  return await knex.transaction(trx => {
    let callbackArgs = new Array(modelClasses.length)

    for (let i = 0; i < modelClasses.length; i++) {
      const reboundClass = class extends modelClasses[i] {}
      Object.defineProperty(reboundClass, 'name', { value: modelClasses[i].name })
      reboundClass.bind(trx)

      callbackArgs[i] = reboundClass
    }

    return callback.apply(trx, callbackArgs)
  })
}

