# RemitAgent

AI-powered stablecoin remittance protocol on Ethereum L2.

Turns a 3-day, 6% Western Union transfer into a 90-second, ~$1 USDC 
settlement on Base — for the $174B/year LATAM remittance corridor.

## How it works

1. Sender deposits USDC into EscrowVault smart contract
2. AI agent picks cheapest L2 route
3. Funds released to recipient in seconds
4. Full refund if anything fails

## Tech stack

- Solidity 0.8.28 + OpenZeppelin
- Hardhat 3 + Mocha tests
- Base L2 + Arbitrum
- Next.js frontend (coming)
- Claude AI agent (coming)

## Contracts

| Contract | Purpose |
|---|---|
| EscrowVault.sol | Locks USDC, handles release and refund |
| MockERC20.sol | Test token for local development |

## Setup

npm install
npx hardhat compile
npx hardhat test

## Progress

- [x] EscrowVault.sol
- [x] MockERC20.sol  
- [x] Test suite
- [ ] RouteResolver.sol
- [ ] Deploy to Base Sepolia
- [ ] Next.js frontend
- [ ] Claude AI agent