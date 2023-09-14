import { User } from './models/index.mjs'

const user = await User.make({ id: 'foo' })

console.log(user)