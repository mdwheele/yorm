/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_timestamp() RETURNS TRIGGER
    LANGUAGE plpgsql
    AS
    $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$;
  `)

  await knex.schema.createTable('users', table => {
    table.uuid('id').defaultTo(knex.fn.uuid()).primary()
    table.string('email').unique()
    table.string('name')
    table.timestamps(false, true)
  })
  
  await knex.raw(`
    CREATE TRIGGER update_timestamp
    BEFORE UPDATE
    ON users
    FOR EACH ROW
    EXECUTE PROCEDURE update_timestamp();
  `)

  await knex.schema.createTable('posts', table => {
    table.uuid('id').defaultTo(knex.fn.uuid()).primary()
    table.uuid('author_id')
    table.text('title')
    table.text('content')
    table.timestamps(false, true)

    table.foreign('author_id').references('users.id')
  })
  
  await knex.raw(`
    CREATE TRIGGER update_timestamp
    BEFORE UPDATE
    ON posts
    FOR EACH ROW
    EXECUTE PROCEDURE update_timestamp();
  `)
  
  await knex.schema.createTable('post_comments', table => {
    table.uuid('id').defaultTo(knex.fn.uuid()).primary()
    table.uuid('author_id')
    table.uuid('post_id')
    table.string('content')
    table.timestamps(false, true)

    table.foreign('author_id').references('users.id')
    table.foreign('post_id').references('posts.id')
  })
  
  await knex.raw(`
    CREATE TRIGGER update_timestamp
    BEFORE UPDATE
    ON post_comments
    FOR EACH ROW
    EXECUTE PROCEDURE update_timestamp();
  `)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('comments')
  await knex.schema.dropTable('posts')
  await knex.schema.dropTable('users')

  await knex.raw(`
    DROP FUNCTION IF EXISTS update_timestamp() CASCADE;
  `)
}
