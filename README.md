# Yet Another ORM 🤷

YORM is a super-simple and light-weight ORM built on top of [Knex](https://knexjs.org) and inspired by Laravel's [Eloquent ORM](https://laravel.com/docs/master/eloquent).

```bash
$ npm install yorm.js
```

```typescript
// CommonJS 
const { Model } = require('yorm.js')

// ESM
import { Model } from 'yorm.js'

// Configure database
Model.configure({
  client: 'sqlite3',
  connection: {
    filename: './database.sqlite'
  }
})
```

## How's it work?

Imagine writing migrations like...

```js
function up(knex) {
  return knex.schema.createTable('users', table => {
    table.uuid('id').defaultTo(knex.fn.uuid()).primary()
    table.string('email').unique()
    table.string('name')
    table.timestamps(false, true)
  })
}

function down(knex) {
  return knex.schema.dropTable('users')  
}
```

Then... imagine writing a class like...

```js
class User extends Model {
  id
  email
  name
  created_at
  updated_at
}
```

... and then, imagine you could just start CRUD-ing from the `users` table ... :unicorn:

```js
// Add a new user to the database!
const user = await User.create({
  email: 'susan@example.com',
  name: 'Susan Example',
})

// Make a change!
user.name = 'S. Example'

// Persist the change!
await user.save()

// Fetch by primary key!
await User.find(user.id)

// Fetch by whatever you want!
await User.where('email', 'susan@example.com') 

// Delete that jank!
await user.delete()
```

## Stop the bad from happening

What if folks start adding random properties here and there? HOW IS YORM GONNA HANDLE THAT?!

<img align="right" width="300" src="https://media.giphy.com/media/14wTbNneogwjba/giphy.gif" />

```js
const user = await User.create({
  email: 'susan@example.com',
  name: 'Susan Example',

  // This will throw an error...
  badProperty: true
})

// ... as will this.
user.badPropertyAfterTheFact = true
```

Before any instance of a model is returned, we seal the object to prevent addition (or removal) of properties from the object. Only properties explicitly declared on the model are allowed... for now.

## I have a legacy code base and my table names look like klingon :anger:

By default, model table names are computed to be a pluralization of the model name:

  - A class named `User` will map to a table named `users`
  - `Comment` will map to `comments`
  - `BirdOfPrey` will map to `birdofpreys`

However, you can always override this in your own model by overriding the static `table` property:

```js
class User extends Model {
  id
  username
  email

  static table = 'maj'
}
```

## I want to use those fancy UUID / ULID things

Well good freakin' news... YORM lets you do whatever you want... seriously. By default, we delegate to your DBMS of choice to do the right thing when it comes to auto-incrementing or database-generated UUIDs and things like that. However, there are times where you'll want to generate an ID before persistance to the database. For that, we have the `generateKey` method.

```js
class Example extends Model {
  id

  static function generateKey() {
    return 'foo'
  }
}
```

Identifiers must be returned as strings. You have control over generation of identifiers. That means it's up to you to make sure they're unique!

To make things simpler, we have some out-of-the-box support for [UUID](https://github.com/uuidjs/uuid), [ULID](https://github.com/perry-mitchell/ulidx) (which are lexicographically sortable), and [nanoid](https://github.com/ai/nanoid). To use these, just return `uuid`, `ulid`, or `nanoid`, respectively. 

```js
class Example extends Model {
  id

  static keyType = 'uuid'
}
```

## Transactional transactions transacting!

Under the hood, YORM models are just a set of utility functions on top of a Knex instance. We use Knex to implement transactions. Normally, this means that we would have to create a transaction context and pass that around to every model that needs to take part in the transaction. However, by storing the current transaction context on the base Model, all instances can automatically make use of the transaction when they are saved. 

We do not support nested transactions because honestly... I don't want to implement a static stack of transaction. Also, I think that shit is confusing and don't need to do it myself! However, if you really need it, open up an issue and we can do it.

```js
const result = await Model.transaction(async (trx) => {
  const user = new User({ name: 'John', email: 'john@example.com' })
  await user.save()

  const profile = new Profile({ 
    user_id: user.getKey(), 
    bio: 'Software developer' 
  })
  await profile.save()

  return { user, profile }
})
```

## Softest of soft deletes

It's somewhat common to support features for "undo"-ing deletes. This is usually accomplished by replacing `DELETE FROM {table} WHERE ...` statements with an `UPDATE SET deleted_at = NOW() WHERE ...` and then having every query function account for this field. If `deleted_at` is `NULL`, the record exists. Otherwise, you have the date and time that the record was deleted.

```js
class SoftDelete extends Model {
  id
  deleted_at

  public static softDeletes = true
}

const model = await SoftDelete.create()

await model.delete() // UPDATE softdeletes SET deleted_at = NOW() WHERE id = 'foo'
```

**Restoring deleted models**

If you have an instance of a model that was _just deleted_, you can call its `.restore()` method and it will be restored.

More commonly, you'll be recovering a model that was deleted in the past where you _do not_ have an instance. In these cases, you can use the static version of the same method to restore ALL models matching specific criteria:

```js
const model = await SoftDelete.create()

await model.delete()

await model.restore()
```

## Hiding model properties from JSON

There are scenarios where you need to have a property on a model that shouldn't be shown in your API. For example, the `password` field on a `User` model. 

You can already override a model's `toJSON()` method to support this use-case, but you have to remember to do it and when you're only hiding a single property, it feels like a lot of boilerplate.

If you define a `hidden` accessor on your model that returns an array of field names, they will automatically be omitted from JSON output.

```js
class User extends Model {
  id
  username
  password

  public static hidden = ['password']
}

const user = User.make({ username: 'user', password: 'super.secret' })

JSON.stringify(user) // { "username": "user" }
```

## Concurrency control through optimistic locking

Imagine two requests modifying the same property on a model at the same time. Which one wins? How do you prevent this?

YORM provides an easy-to-follow optimistic locking strategy through the use of versioning. Every time a Model instance is updated, it's version will be incremented. When saving, we check the local instance version with the version in the database and if they do not match, we throw a concurrency error.
