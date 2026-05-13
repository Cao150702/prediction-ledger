import { useState } from 'react';

export default function SubmitPage() {
  const [asset, setAsset] = useState('BTC/USD');
  const [direction, setDirection] = useState('long');
  const [targetPrice, setTargetPrice] = useState('72000');
  const [timeframe, setTimeframe] = useState('72');
  const [confidence, setConfidence] = useState('0.75');
  const [commitHash, setCommitHash] = useState('');
  const [salt, setSalt] = useState('');
  const [predictionJson, setPredictionJson] = useState('');

  async function computeHash(predJson, saltStr) {
    const enc = new TextEncoder();
    const data = enc.encode(predJson + saltStr);
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuf));
    const hashHex = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  async function onPrepare(e) {
    e.preventDefault();
    const s = Math.random().toString(36).slice(2, 12);
    const now = Math.floor(Date.now() / 1000);
    const pred = {
      predictor_id: (window.ethereum && window.ethereum.selectedAddress) || '0x0',
      asset,
      direction: direction === 'long' ? 'long' : direction === 'short' ? 'short' : 'neutral',
      target_price: Number(targetPrice),
      target_change_pct: 0,
      timeframe_hours: Number(timeframe),
      confidence: Number(confidence),
      stop_loss_pct: 0,
      submitted_at: now,
      salt: s,
      notes: ''
    };
    const j = JSON.stringify(pred);
    setPredictionJson(j);
    setSalt(s);
    const h = await computeHash(j, s);
    setCommitHash(h);
  }

  // Example: sending commit tx via window.ethereum + ethers (requires ethers installed)
  async function onCommit() {
    if (!commitHash) return alert('先生成 commitHash');
    if (!window.ethereum) return alert('需要钱包（MetaMask）');
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const { ethers } = await import('ethers');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const abi = ["function commitPrediction(bytes32 commitHash) payable"];
      const ledger = new ethers.Contract(process.env.NEXT_PUBLIC_LEDGER_ADDRESS, abi, signer);
      const tx = await ledger.commitPrediction(commitHash, { value: ethers.parseEther('0.001') });
      alert('tx sent: ' + tx.hash);
    } catch (err) {
      console.error(err);
      alert('发送失败，查看控制台');
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Submit Prediction (scaffold)</h1>
      <form onSubmit={onPrepare}>
        <div>
          <label>Asset</label>
          <input value={asset} onChange={e => setAsset(e.target.value)} />
        </div>
        <div>
          <label>Direction</label>
          <select value={direction} onChange={e => setDirection(e.target.value)}>
            <option value="long">Long</option>
            <option value="short">Short</option>
            <option value="neutral">Neutral</option>
          </select>
        </div>
        <div>
          <label>Target Price</label>
          <input value={targetPrice} onChange={e => setTargetPrice(e.target.value)} />
        </div>
        <div>
          <label>Submitted Price (price now)</label>
          <input value={targetPrice} onChange={e => setTargetPrice(e.target.value)} />
        </div>
        <div>
          <label>Timeframe (hours)</label>
          <input value={timeframe} onChange={e => setTimeframe(e.target.value)} />
        </div>
        <div>
          <label>Confidence</label>
          <input value={confidence} onChange={e => setConfidence(e.target.value)} />
        </div>
        <button type="submit">生成 commit</button>
      </form>

      {commitHash && (
        <div style={{ marginTop: 20 }}>
          <p>commitHash: <code>{commitHash}</code></p>
          <p>salt: <code>{salt}</code></p>
          <p>predictionJson: <pre style={{ whiteSpace: 'pre-wrap' }}>{predictionJson}</pre></p>
          <button onClick={onCommit}>签名并提交 commit tx</button>
          <p style={{ color: '#666', marginTop: 8 }}>本地已保存，你可以在 Reveal 页面查找并揭示（不要清除浏览器数据）。</p>
        </div>
      )}
    </div>
  );
}
