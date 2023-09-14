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