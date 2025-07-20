/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('users', table => {
      table.increments('id')
      table.string('username')
      table.string('password')
      table.timestamps(true, true, false)
    })
    .createTable('tasks', table => {
      table.increments('id')
      table.text('title')
      table.text('description')
      table.integer('owner_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.timestamps(true, true, false)
    })
    .createTable('comments', table => {
      table.increments('id')
      table.text('content')
      table.integer('author_id').nullable().unsigned().references('id').inTable('users').onDelete('SET NULL')
      table.integer('task_id').unsigned().references('id').inTable('tasks').onDelete('CASCADE')
      table.timestamps(true, true, false)
    })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('comments')
    .dropTableIfExists('tasks')
    .dropTableIfExists('users')
};
