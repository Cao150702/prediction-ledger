const hre = require("hardhat");
const fs = require('fs');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address, "on network", hre.network.name);

  const Ledger = await hre.ethers.getContractFactory("PredictionLedger");
  const ledger = await Ledger.deploy();
  await ledger.deployed();

  console.log("PredictionLedger deployed to:", ledger.address);

  const out = {
    PredictionLedger: {
      address: ledger.address,
      deployer: deployer.address,
      chain: hre.network.name
    }
  };
  const filename = `deployments-${hre.network.name}.json`;
  fs.writeFileSync(filename, JSON.stringify(out, null, 2));
  console.log(`Wrote ${filename}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
