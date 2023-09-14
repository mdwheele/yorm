(async () => {
  const { User } = require('./models')
  
  const user = await User.make({ id: 'foo' })
  
  console.log(user)
})()