// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";

contract PredictionLedger is Ownable {
    uint256 public constant DEPOSIT = 0.001 ether;
    uint256 public nextPredictionId = 1;

    struct Commit {
        address predictor;
        uint256 commitTimestamp;
        uint256 deposit;
        bool exists;
    }

    struct Prediction {
        address predictor;
        string predictionJson;
        string asset;
        int8 direction; // 1 long, -1 short, 0 neutral
        int256 targetPrice;
        int256 targetChangePct_x100; // percent * 100 (e.g., 5.2% -> 520)
        int256 submittedPrice; // price at time of prediction
        uint256 timeframeHours;
        uint256 confidence_x100; // confidence * 100
        uint256 stopLossPct_x100;
        uint256 submittedAt;
        bool revealed;
        bool settled;
        uint256 commitTimestamp;
        uint256 score; // 0-100
    }

    // mapping from commit hash => Commit
    mapping(bytes32 => Commit) public commits;
    // mapping from id => Prediction
    mapping(uint256 => Prediction) public predictions;
    // predictor => list of prediction ids
    mapping(address => uint256[]) public predictorPredictions;

    event PredictionCommitted(address indexed predictor, bytes32 hash, uint256 timestamp);
    event PredictionRevealed(uint256 indexed predictionId, address indexed predictor, string json);
    event PredictionSettled(uint256 indexed predictionId, int256 score);

    // Commit phase: user supplies sha256(predictionJson + salt) and deposit
    function commitPrediction(bytes32 commitHash) external payable {
        require(msg.value >= DEPOSIT, "deposit too low");
        require(!commits[commitHash].exists, "commit exists");
        commits[commitHash] = Commit({predictor: msg.sender, commitTimestamp: block.timestamp, deposit: msg.value, exists: true});
        emit PredictionCommitted(msg.sender, commitHash, block.timestamp);
    }

    // Reveal phase: supply the original predictionJson and salt so hash matches commit
    // Additionally pass structured fields for on-chain indexing/scoring. Frontend must ensure the structured fields match the JSON used to create the commit.
    function revealPrediction(
        string calldata predictionJson,
        string calldata salt,
        string calldata asset,
        int8 direction,
        int256 targetPrice,
        int256 targetChangePct_x100,
        int256 submittedPrice,
        uint256 timeframeHours,
        uint256 confidence_x100,
        uint256 stopLossPct_x100,
        uint256 submittedAt,
        string calldata /* notes */
    ) external {
        bytes32 h = sha256(abi.encodePacked(predictionJson, salt));
        Commit memory c = commits[h];
        require(c.exists, "no matching commit");
        require(c.predictor == msg.sender, "not predictor");

        uint256 pid = nextPredictionId++;
        predictions[pid] = Prediction({
            predictor: msg.sender,
            predictionJson: predictionJson,
            asset: asset,
            direction: direction,
            targetPrice: targetPrice,
            targetChangePct_x100: targetChangePct_x100,
            submittedPrice: submittedPrice,
            timeframeHours: timeframeHours,
            confidence_x100: confidence_x100,
            stopLossPct_x100: stopLossPct_x100,
            submittedAt: submittedAt,
            revealed: true,
            settled: false,
            commitTimestamp: c.commitTimestamp,
            score: 0
        });

        predictorPredictions[msg.sender].push(pid);

        // refund deposit to predictor (MVP behavior)
        if (c.deposit > 0) {
            (bool ok, ) = msg.sender.call{value: c.deposit}("\x01");
            // ignore refund failure for simplicity
            ok;
        }

        // mark commit as used
        delete commits[h];

        emit PredictionRevealed(pid, msg.sender, predictionJson);
    }

    // Settle: admin/oracle calls with observed price. Scoring performed on-chain (MVP)
    function settlePrediction(uint256 predictionId, int256 actualPrice) external onlyOwner {
        Prediction storage p = predictions[predictionId];
        require(p.revealed, "not revealed");
        require(!p.settled, "already settled");

        // Direction score (40 pts)
        int8 actualDirection = 0;
        if (actualPrice > p.submittedPrice) actualDirection = 1;
        else if (actualPrice < p.submittedPrice) actualDirection = -1;
        uint256 directionScore = (actualDirection == p.direction) ? 40 : 0;

        // Magnitude score (40 pts)
        // predicted and actual are in x100 (e.g., 5.2% -> 520)
        int256 actual_pct_x100 = 0;
        if (p.submittedPrice != 0) {
            // actual_pct = (actualPrice - submittedPrice) / submittedPrice * 100
            // scaled by 100 => *10000
            actual_pct_x100 = (actualPrice - p.submittedPrice) * 10000 / p.submittedPrice; // may be negative
        }
        int256 diff = actual_pct_x100 - p.targetChangePct_x100;
        if (diff < 0) diff = -diff;
        // magnitude score times 100
        int256 magnitudeScore_x100 = 4000 - (diff * 8);
        if (magnitudeScore_x100 < 0) magnitudeScore_x100 = 0;
        uint256 magnitudeScore = uint256(magnitudeScore_x100) / 100; // back to 0-40 scale (floor)

        // Time score (20 pts) - simple: if settled within timeframe => full points
        uint256 timeScore = 0;
        uint256 deadline = p.submittedAt + p.timeframeHours * 1 hours;
        if (block.timestamp <= deadline) {
            timeScore = 20;
        } else {
            // overtime percent = (elapsed - timeframe) / timeframe
            uint256 overtime = block.timestamp - deadline;
            uint256 overtimePercent_x100 = 0;
            if (p.timeframeHours > 0) {
                overtimePercent_x100 = overtime * 100 / (p.timeframeHours * 1 hours);
            }
            // each 10% overtime = -4 pts
            uint256 penaltySteps = overtimePercent_x100 / 10; // since overtimePercent_x100 is percent
            uint256 penalty = penaltySteps * 4;
            if (penalty >= 20) timeScore = 0; else timeScore = 20 - penalty;
        }

        uint256 totalScore = directionScore + magnitudeScore + timeScore;
        if (totalScore > 100) totalScore = 100;

        p.score = totalScore;
        p.settled = true;

        emit PredictionSettled(predictionId, int256(totalScore));
    }

    // Simple leaderboard stats for a predictor (MVP)
    function getLeaderboard(address predictor) external view returns (uint256 totalPredictions, uint256 totalScore, uint256 winCount) {
        uint256[] storage ids = predictorPredictions[predictor];
        totalPredictions = ids.length;
        totalScore = 0;
        winCount = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            Prediction storage p = predictions[ids[i]];
            if (p.settled) {
                totalScore += p.score;
                if (p.score >= 50) winCount += 1; // arbitrary: score >=50 considered a win
            }
        }
    }
}
