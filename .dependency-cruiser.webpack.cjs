const { resolve } = require('node:path')

module.exports = {
  resolve: {
    alias: { '@': resolve(__dirname, 'apps/forum/src') },
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
  },
}
