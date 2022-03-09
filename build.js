import path from 'path'
import http from 'http'
import fs from 'fs'

import esbuild from 'esbuild'
import alias from 'esbuild-plugin-alias'
import mime from 'mime'

esbuild.build({
  watch: process.argv.includes('-w') || process.argv.includes('--watch'),
  entryPoints: ['./src/index.tsx'],
  bundle: true,
  inject: ['./src/react-shim.ts'],
  outfile: './dist/index.js',
  publicPath: '/',
  minify: process.argv.includes('-m') || process.argv.includes('--minify'),
  jsxFactory: 'jsx',
  loader: {
    '.ttf': 'file',
    '.eot': 'file',
    '.woff': 'file',
    '.woff2': 'file',
    '.png': 'file',
    '.jpg': 'file',
    '.svg': 'file'
  },
  plugins: [
    alias({
      'zlib': path.resolve('./node_modules/browserify-zlib/lib/index.js'),
      'stream': path.resolve('./node_modules/stream-browserify/index.js'),
      'crypto': path.resolve('./node_modules/crypto-browserify/index.js'),
      'http': path.resolve('./node_modules/stream-http/index.js'),
      'https': path.resolve('./node_modules/stream-http/index.js'),
      'fs': path.resolve('./node_modules/browserify-fs/index.js'),
      'buffer': path.resolve('./node_modules/buffer/index.js'),
      'events': path.resolve('./node_modules/events/events.js'),
      'util': path.resolve('./node_modules/util/util.js'),
      'url': path.resolve('./node_modules/url/url.js'),
      'assert': path.resolve('./node_modules/assert/build/assert.js'),
      'path': path.resolve('./node_modules/path/path.js'),
    }),
  ],
  define: {
    'process.platform': '"web"',
    'process.env.WEB_ORIGIN': '"http://localhost:1234"',
    'process.env.WEB_SANDBOX_ORIGIN': '"http://localhost:2345"'
  }
})

if (process.argv.includes('-s') || process.argv.includes('--serve')) {
  http
    .createServer(async (req, res) => {
      
      const url = new URL(req.url, 'http://localhost:4560')
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:1234')
      try {
        
        res.setHeader('Content-Type', mime.getType(path.resolve('./', path.join('dist', url.pathname))))
        await new Promise((resolve, reject) =>
          fs
            .createReadStream(path.resolve('./', path.join('dist', url.pathname)))
            .on('error', reject)
            .on('finish', resolve)
            .pipe(res)
        )
      } catch (err) {
        res.writeHead(404)
        res.end()
      }
    })
    .listen(4560)
}
