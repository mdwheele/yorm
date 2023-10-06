import knex from './knex'
import { Model } from '../src/Model'

class Puppy extends Model {
  name = "Sparky"
  muddy = false

  rollAround() {
    this.muddy = true
  }
}

describe('dirty tracking on models', () => {
  test('new objects are not dirty', () => {
    const puppy = Puppy.make()

    expect(puppy.isDirty()).toBe(false)

    puppy.rollAround()

    expect(puppy.isDirty()).toBe(true)
    expect(puppy.isDirty('name')).toBe(false)

    expect(puppy.isClean()).toBe(false)
    expect(puppy.isClean('name')).toBe(true)

    expect(puppy.wasChanged()).toEqual(['muddy'])
  })
})


