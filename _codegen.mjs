import { readFile, writeFile } from 'fs/promises'

const pkg = JSON.parse(await readFile('./package.json'))
pkg.type = undefined
writeFile('./package.json', JSON.stringify(pkg, undefined, 2) + '\n')
