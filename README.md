# Yet Another ORM 🤷

YORM is a no-nonsense, super-simple and light-weight ORM built on top of [Knex](https://knexjs.org) and inspired by Laravel's [Eloquent ORM](https://laravel.com/docs/master/eloquent).

```bash
$ npm install yorm.js
```

```js
// CommonJS 
const { Model } = require('yorm.js')

// ESM
import { Model } from 'yorm.js'
```

```js

class Example extends Model {
  hello = 'Hello'
  world = 'World'

  toString() {
    return `${this.hello}, ${this.world}!`
  }
}

const example = Example.make()

console.log(`${example}`)  // Hello, World!
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
await User.where({ email: 'susan@example.com' }) 

// Delete that jank!
await user.delete()

// Count and stuff!
await User.count()
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

## NO CONSTRUCTORS?! :fire:

YORM models don't have constructors... or rather... they do... but they're private and throw a `TypeError` when you try to use them. 99% of the time, you'll just `User.create(...)` and be on your way. If you want an instance of a user _without saving to the database_, call `User.make(...)` instead.

## I have a legacy code base and my table names look like klingon :anger:

By default, model table names are computed to be a pluralization of the model name:

  - A class named `User` will map to a table named `users`
  - `Comment` will map to `comments`
  - `BirdOfPrey` will map to `birdofpreys`

However, you can always override this in your own model by adding a `tableName` accessor:

```js
class User extends Model {
  id
  username
  email

  get tableName() {
    return 'maj'  // Klingon for "Well Done!"
  }
}
```

## I want to use those fancy UUID / ULID things

Well good freakin' news... YORM lets you do whatever you want... seriously. By default, we delegate to your DBMS of choice to do the right thing when it comes to auto-incrementing or database-generated UUIDs and things like that. However, there are times where you'll want to generate an ID before persistance to the database. For that, we have the `newUniqueId` accessor.

```js
class Example extends Model {
  id

  get newUniqueId() {
    return 'foo'
  }
}
```

Identifiers must be returned as strings. You have control over generation of identifiers. That means it's up to you to make sure they're unique!

To make things simpler, we have some out-of-the-box support for [UUID](https://github.com/uuidjs/uuid), [ULID](https://github.com/perry-mitchell/ulidx) (which are lexicographically sortable), and [nanoid](https://github.com/ai/nanoid). To use these, just return `uuid`, `ulid`, or `nanoid`, respectively. 

```js
class Example extends Model {
  id

  get newUniqueId() {
    return 'uuid' // '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
  }
}
```

## What about circular dependencies?

It's very, very common to want to have two models that relate to one another. Imagine a "user has posts", but a "post belongs to a user". Unfortunately, in Node, you run into all sorts of funky issues when you have two modules require one another. Instead, YORM advises to create an `index.js` file wherever you keep your models at. This file will re-export all of your models and at the same time, `register` all of the models with one another.

By doing this, we're allowing all the modules to load, THEN we're iterating through each of them and "telling" the others about the full collection. Check it out:

```js
const { Model } = require('yorm.js')

// None of these modules should `require(...)` one another.
const User = require('./User.js')
const Post = require('./Post.js')
const Comment = require('./Comment.js')

module.exports = { User, Post, Comment }

Model.register(module.exports)
```

Of course, you are completely free to ignore this altogether and do whatever you do to manage circular dependencies. Each of the relationship mapping functions expect to be given a class reference and they don't care how that happens. As long as they can call `.name` on what you pass in and `new` it up, it's all good. For example, if I know I won't be putting a `.belongsTo(...)` relationship from `Post` to `User`, I could just do this:

```js
const { Model } = require('yorm.js')
const Post = require('./Post.js')

class User extends Model {
  id
  username
  email

  posts() {
    // SELECT * FROM posts WHERE user_id = '${this.id}'
    return this.hasMany(Post)
  }
}
```

## How do I tell YORM about my `knex` instance?

Wherever you set up your application's shared `knex` instance, just call `Model.boot(knex)` when it's ready. This tells YORM to use that instance of `knex`.

```js
const { knex } = require('knex')
const knexfile = require('./knexfile.js')

const { Model } = require('yorm')

Model.boot(knex(knexfile))

module.exports = knex
```

## Softest of soft deletes

It's somewhat common to support features for "undo"-ing deletes. This is usually accomplished by replacing `DELETE FROM {table} WHERE ...` statements with an `UPDATE SET deleted_at = NOW() WHERE ...` and then having every query function account for this field. If `deleted_at` is `NULL`, the record exists. Otherwise, you have the date and time that the record was deleted.

```js
class SoftDelete extends Model {
  id
  deleted_at

  get softDeletes() { return true }
}

const model = await SoftDelete.create()

await model.delete() // UPDATE softdeletes SET deleted_at = NOW() WHERE id = 'foo'
```

**Customizing the field name**

You can override the default `deleted_at` field name can be done globally or per-model. You can also set a default name globally and then override in specific models.

To override globally, use the `deletedAtColumn` option when you call `Model.boot(...)`:

```js
Model.boot(knex, { 
  deletedAtColumn: 'deletedAt'
})
```

To set this value per-model, override the `deletedAtColumn` accessor:

```js
get deletedAtColumn() {
  return 'deleted_date'
}
```

## BuT wHaT aBoUt ReLaTiOnShIpS!?!

Thought you'd never ask! YORM supports the usual relationship types:

  - One to One
  - One to Many
  - Belongs To

YORM does not support "Many to Many" relationships yet because honestly... haven't needed em' in a while and I'm just slapping this together. It'll be added for sure.

### One to Many 

```js
class User extends Model {
  id
  username
  email

  posts() {
    // Normally, hasMany would compute that the foreign key on 
    // the posts table should be `user_id`, referencing this model's
    // singularized table name. However, we can also override that
    // behaviour like so.
    return this.hasMany(this.models.Post, 'author_id')
  }

  comments() {
    // SELECT * FROM posts WHERE author_id = '${this.id}'
    return this.hasMany(this.models.Post, 'author_id')
  }
}
```

There's a couple things going on up there. First, we're modeling two relationships: A user has-many posts and a user has-many comments. You see two different flavors for how this can be done. In the simplest case (not shown), you only have to return `this.hasMany(...)` with a single argument that references the related model. The ORM will inspect that model for its computed table name and follow a convention that the foreign-key on the related table will point back to `{tableName}_id`. So, in this case, it would NORMALLY point back to `users.user_id`. However, in our example, the `posts` and `comments` tables named that field `author_id`. The second argument to `hasMany` allows you to override that foreign key name.

### One to One

```js
class User extends Model {
  id
  username
  email

  photo() {
    // SELECT * FROM photos WHERE photos.user_id = '${this.id}' LIMIT 1
    return this.hasOne(this.models.Photo)
  }
}
```

### Belongs To

```js
class Post extends Model {
  id
  author_id
  title
  content
  created_at
  updated_at

  user() {
    // SELECT * FROM users WHERE id = '${this.author_id}'
    return this.belongsTo(this.models.User, 'author_id')
  }
}
```

A "Belongs To" relationship is the inverse of a One-to-Many relationship. If a User has-many Posts, then this is a way to get an individual Post's author through that same relationship.