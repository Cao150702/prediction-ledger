const { expect } = require("chai");
const { ethers } = require("hardhat");

const { createHash } = require('crypto');

describe("PredictionLedger (commit -> reveal -> settle)", function () {
  it("full flow with perfect prediction scores 100", async function () {
    const [owner, alice] = await ethers.getSigners();

    const Ledger = await ethers.getContractFactory("PredictionLedger");
    const ledger = await Ledger.connect(owner).deploy();
    await ledger.deployed();

    // prepare prediction fields
    const prediction = {
      predictor_id: alice.address,
      asset: "BTC/USD",
      direction: 1, // long
      target_price: 110,
      target_change_pct: 10.0,
      timeframe_hours: 72,
      confidence: 0.8,
      stop_loss_pct: 2.0,
      submitted_at: Math.floor(Date.now() / 1000),
      salt: "random_salt_123",
      notes: "testing"
    };

    const predictionJson = JSON.stringify(prediction);
    const salt = prediction.salt;

    // compute sha256(predictionJson + salt)
    const commitHash = ethers.utils.sha256(ethers.utils.toUtf8Bytes(predictionJson + salt));

    // Alice commits with deposit
    await ledger.connect(alice).commitPrediction(commitHash, { value: ethers.utils.parseEther("0.001") });

    // reveal with structured fields (note targetChangePct_x100 = 10.0 -> 1000)
    await ledger.connect(alice).revealPrediction(
      predictionJson,
      salt,
      prediction.asset,
      prediction.direction,
      prediction.target_price,
      Math.round(prediction.target_change_pct * 100),
      prediction.target_price - Math.round(prediction.target_price / (1 + prediction.target_change_pct / 100)), // dummy submittedPrice
      prediction.timeframe_hours,
      Math.round(prediction.confidence * 100),
      Math.round(prediction.stop_loss_pct * 100),
      prediction.submitted_at,
      prediction.notes
    );

    // For reliability, fetch prediction id 1
    const p = await ledger.predictions(1);
    expect(p.revealed).to.equal(true);

    // Create new prediction with explicit submittedPrice = 100
    const prediction2 = Object.assign({}, prediction);
    prediction2.target_price = 110;
    prediction2.salt = "s2";
    const predictionJson2 = JSON.stringify(prediction2);
    const commitHash2 = ethers.utils.sha256(ethers.utils.toUtf8Bytes(predictionJson2 + prediction2.salt));
    await ledger.connect(alice).commitPrediction(commitHash2, { value: ethers.utils.parseEther("0.001") });

    await ledger.connect(alice).revealPrediction(
      predictionJson2,
      prediction2.salt,
      prediction2.asset,
      prediction2.direction,
      prediction2.target_price,
      Math.round(prediction2.target_change_pct * 100),
      100, // submittedPrice
      prediction2.timeframe_hours,
      Math.round(prediction2.confidence * 100),
      Math.round(prediction2.stop_loss_pct * 100),
      prediction2.submitted_at,
      prediction2.notes
    );

    // settle prediction id 2 with actualPrice 110 -> perfect
    await ledger.connect(owner).settlePrediction(2, 110);

    const settled = await ledger.predictions(2);
    expect(settled.settled).to.equal(true);
    expect(settled.score.toNumber()).to.equal(100);

    // leaderboard
    const stats = await ledger.getLeaderboard(alice.address);
    expect(stats.totalPredictions.toNumber()).to.be.gte(1);
  });
});
