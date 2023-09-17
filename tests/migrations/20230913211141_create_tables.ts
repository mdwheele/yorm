import { Knex } from "knex"

export async function up(knex: Knex) {
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
    table.string('username').unique()
    table.string('name')
    table.timestamps(false, true)
    table.dateTime('deleted_at').defaultTo(null)
  })

  await knex.schema.createTable('custom_deleted_at', table => {
    table.uuid('id').defaultTo(knex.fn.uuid()).primary()
    table.dateTime('deletedAt').defaultTo(null)
  })
}

export async function down(knex: Knex) {
  await knex.schema.dropTable('users')
  await knex.schema.dropTable('custom_deleted_at')

  await knex.raw(`DROP FUNCTION IF EXISTS update_timestamp() CASCADE;`)
}
