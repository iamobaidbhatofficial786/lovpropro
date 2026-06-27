#!/usr/bin/env node
/**
 * Cross-platform RS256 Key Pair Generator for Licensing System.
 * Generates pkcs8_private.pem and public.pem in the project root.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateKeys() {
  console.log('Generating secure 2048-bit RSA key pair...');
  
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  const privateKeyPath = path.join(__dirname, '..', 'pkcs8_private.pem');
  const publicKeyPath = path.join(__dirname, '..', 'public.pem');

  fs.writeFileSync(privateKeyPath, privateKey, 'utf8');
  fs.writeFileSync(publicKeyPath, publicKey, 'utf8');

  console.log('\nKeys generated successfully!');
  console.log('- Private key saved to: pkcs8_private.pem');
  console.log('- Public key saved to: public.pem\n');
  console.log('Keep these keys safe. The private key will be configured in Vercel, and the public key will be embedded in security.js.\n');
}

try {
  generateKeys();
} catch (error) {
  console.error('Error generating keys:', error);
  process.exit(1);
}
