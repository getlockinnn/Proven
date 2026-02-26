# Proven Stake Program (Devnet)

Minimal Anchor program to hold SOL in a PDA escrow for challenge stakes on Devnet.

## Prereqs
- Rust + Solana CLI + Anchor
- Solana keypair at `~/.config/solana/id.json`
- Set your CLI to devnet:

```
solana config set --url https://api.devnet.solana.com
```

## Build & Deploy
```
anchor build
anchor deploy --provider.cluster devnet
```

Update the deployed Program ID in:
- `proven-program/Anchor.toml` (programs.devnet.proven_stake)
- Frontend env `NEXT_PUBLIC_PROGRAM_ID`

## Testing
- `anchor test` spins up a local validator (configured in `Anchor.toml`) so it
  won’t clash with the program already deployed to Devnet.
- If you need to point the tests at Devnet, override on the command line:
  `anchor test --provider.cluster devnet` (you must control the existing
  program’s upgrade authority for that to succeed).

## Notes
- PDA seed: `escrow`
- Instructions: `initialize`, `stake(amount)`, `unstake(amount)`
- This MVP moves lamports to/from the PDA. You can harden with role checks and per-challenge PDAs later.
