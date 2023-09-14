# YORM

Yet Another ORM 🤷

> Going to be writing some more documentation but for now...

YORM is a no-nonsense, super-simple and light-weight ORM built on top of [Knex](https://knexjs.org) and inspired by Laravel's [Eloquent ORM](https://laravel.com/docs/master/eloquent).

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

## Model properties are the source of truth

What if folks start adding random properties here and there. HOW IS YORM GONNA HANDLE THAT?!

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

You see, before any instance of a model is returned, we seal the object to prevent addition (or removal) of properties from the object. Only properties explicitly declared on the model are allowed... for now.

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

## What about circular dependencies?

It's very, very common to want to have two models that relate to one another. Imagine a "user has posts", but a "post belongs to a user". Unfortunately, in Node, you run into all sorts of funky issues when you have two modules require one another. Instead, YORM advises to create an `index.js` file wherever you keep your models at. This file will re-export all of your models and at the same time, `associate` all of the models with one another.

By doing this, we're allowing all the modules to load, THEN we're iterating through each of them and "telling" the others about the full collection. Check it out:

```js
const fs = require('fs')
const path = require('path')

const models = {}

fs.readdirSync(path.join(__dirname)).forEach(file => {
  if (file === 'index.js') {
    return
  }

  const model = path.parse(file).name

  models[model] = require(path.join(__dirname, file))
})

Object.keys(models).forEach(model => {
  models[model].associate(models)
})

module.exports = models
```

## How do I tell YORM about my `knex` instance?

Wherever you set up your application's shared `knex` instance, just call `Model.boot(knex)` when it's ready. This tells YORM to use that instance of `knex`.

```js
const knexfile = require('./knexfile.js')

const knex = require('knex').default(knexfile)

const { Model } = require('yorm')

Model.boot(knex)

module.exports = knex
```

## BuT wHaT aBoUt ReLaTiOnShIpS!?!

Thought you'd never ask! YORM supports the usual relationship types:

  - One to One
  - One to Many
  - Belongs To

YORM does not support "Many to Many" relationships yet because honestly... haven't needed em' in a while and I'm just slapping this together. It'll be added for sure.
### One to One

Coming soon!
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
    // You can also pass in a string that maps to the name of a model
    // that was passed to Model.associate(...) calls during bootstrapping.
    return this.hasMany('Comment', 'author_id')
  }
}
```

There's a couple things going on up there. First, we're modeling two relationships: A user has-many posts and a user has-many comments. You see two different flavors for how this can be done. In the simplest case (not shown), you only have to return `this.hasMany(...)` with a single argument that references the related model. The ORM will inspect that model for its computed table name and follow a convention that the foreign-key on the related table will point back to `{tableName}_id`. So, in this case, it would NORMALLY point back to `users.user_id`. However, in our example, the `posts` and `comments` tables named that field `author_id`. The second argument to `hasMany` allows you to override that foreign key name.

### Belongs To

Coming soon!