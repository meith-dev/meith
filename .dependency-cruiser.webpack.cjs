const { resolve } = require('node:path')

module.exports = {
  resolve: {
    alias: { '@': resolve(__dirname, 'apps/community/src') },
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
  },
}
