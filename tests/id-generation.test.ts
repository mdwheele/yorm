import { Model } from '../src/Model'
import * as uuid from 'uuid'
import ulidx from 'ulidx'

describe('globally unique identifier generation', () => {
  test('default behaviour', () => {
    class Default extends Model {
      id
    }

    const instance = Default.make()

    expect(instance.id).toBe(undefined)
  })

  test('user provided function', () => {
    class UserProvided extends Model {
      id 

      get newUniqueId() { return 'foo' }
    }

    expect(UserProvided.make().id).toBe('foo')
    expect(UserProvided.make({ id: 'bar' }).id).toBe('bar')
  })

  test('uuid', () => {
    class UUID extends Model {
      id

      get newUniqueId() { return 'uuid' }
    }

    expect(uuid.validate(UUID.make().id)).toBe(true)
    expect(UUID.make({ id: 'stub' }).id).toBe('stub')
  })

  test('ulid', () => {
    class ULID extends Model {
      id: string

      get newUniqueId() { return 'ulid' }
    }

    const first = ULID.make()
    const second = ULID.make()

    expect(ulidx.isValid(first.id)).toBe(true)

    expect(ULID.make({ id: 'stub' }).id).toBe('stub')
  })

  test('nanoid', () => {
    class NanoID extends Model {
      id

      get newUniqueId() { return 'nanoid' }
    }

    const instance = NanoID.make()

    expect(typeof instance.id === 'string').toBe(true)
    expect(instance.id.length).toBe(21)

    expect(NanoID.make({ id: 'stub' }).id).toBe('stub')
  })
})