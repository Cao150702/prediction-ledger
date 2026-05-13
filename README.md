# PredictionLedger

On-Chain Prediction Accountability System (MVP)

This repository contains a Hardhat-based Solidity contract implementing a commit-reveal prediction ledger (MVP).

Quick start:

1. npm install
2. npx hardhat test

Contract: contracts/PredictionLedger.sol


## Deploying

Local (Hardhat):

1. npm install
2. npm run deploy:local

Deploy to Arbitrum Sepolia (testnet):

1. Copy `.env.example` to `.env` and fill ARBITRUM_SEPOLIA_RPC_URL and PRIVATE_KEY
2. npm install
3. npm run deploy:sep

Note: use a funded testnet account for PRIVATE_KEY. The deploy script writes `deployments-<network>.json` on success.
