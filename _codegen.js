const { readFile, writeFile } = require('fs/promises')

readFile('./package.json')
  .then(str => {
    const pkg = JSON.parse(str)
    pkg.type = 'module'
    writeFile('./package.json', JSON.stringify(pkg, undefined, 2) + '\n')
  })
