#!/bin/bash

echo "🚰 Setting up USDC Faucet for Devnet"
echo ""

# Check if faucet keypair already exists
if [ -f "faucet-keypair.json" ]; then
    echo "✅ Faucet keypair already exists"
    FAUCET_PUBKEY=$(solana-keygen pubkey faucet-keypair.json)
else
    echo "📝 Generating new faucet keypair..."
    solana-keygen new --no-bip39-passphrase --outfile faucet-keypair.json
    FAUCET_PUBKEY=$(solana-keygen pubkey faucet-keypair.json)
    echo "✅ Created faucet keypair"
fi

echo ""
echo "📍 Faucet Public Key: $FAUCET_PUBKEY"
echo ""

# Airdrop SOL for transaction fees
echo "💰 Airdropping SOL for transaction fees..."
solana airdrop 2 $FAUCET_PUBKEY --url devnet

echo ""
echo "✅ Faucet setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Add to .env: FAUCET_SECRET_KEY=$(cat faucet-keypair.json)"
echo "   2. Mint USDC to this faucet address using spl-token CLI"
echo ""
