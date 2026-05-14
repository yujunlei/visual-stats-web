#!/usr/bin/env node
const { generateKeyPairSync } = require('node:crypto')

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

console.log('LICENSE_PRIVATE_KEY_PEM=')
console.log(privateKey.export({ type: 'pkcs8', format: 'pem' }))
console.log('VISUAL_STATS_LICENSE_PUBLIC_KEY_PEM=')
console.log(publicKey.export({ type: 'spki', format: 'pem' }))
console.log('Keep the private key only on the license server. Put the public key into the Electron client build configuration.')

