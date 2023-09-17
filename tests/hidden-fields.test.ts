import { Model } from '../src/Model'

class User extends Model {
  id
  username
  email
  password

  get hidden() {
    return ['password']
  }
}

test('attributes can be hidden from JSON', () => {
  const user = User.make({ id: 1, username: 'susan', email: 'susan@example.com', password: 'password' })

  expect(user.toJSON()).not.toHaveProperty('password')
  expect(user).toHaveProperty('password')
})