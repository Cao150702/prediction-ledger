import { useEffect, useState } from 'react';

function directionToInt(d) {
  if (d === 'long') return 1;
  if (d === 'short') return -1;
  return 0;
}

export default function RevealPage() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const found = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('prediction:')) {
        try {
          const v = JSON.parse(localStorage.getItem(key));
          found.push({ key, ...v });
        } catch (e) { }
      }
    }
    setItems(found);
    if (found.length > 0) setSelected(found[0]);
  }, []);

  async function onReveal(item) {
    if (!item) return;
    setStatus('请求钱包连接...');
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const { ethers } = await import('ethers');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const abi = [
        "function revealPrediction(string predictionJson,string salt,string asset,int8 direction,int256 targetPrice,int256 targetChangePct_x100,int256 submittedPrice,uint256 timeframeHours,uint256 confidence_x100,uint256 stopLossPct_x100,uint256 submittedAt,string notes)"
      ];
      const ledger = new ethers.Contract(process.env.NEXT_PUBLIC_LEDGER_ADDRESS, abi, signer);

      const pred = item.prediction;
      const predictionJson = JSON.stringify(pred);
      const salt = pred.salt;
      const asset = pred.asset;
      const direction = directionToInt(pred.direction);
      const targetPrice = Math.round(pred.target_price);
      const targetChangePct_x100 = Math.round((pred.target_change_pct || 0) * 100);
      const submittedPrice = Math.round(pred.submitted_price || 0);
      const timeframeHours = Number(pred.timeframe_hours || 0);
      const confidence_x100 = Math.round((pred.confidence || 0) * 100);
      const stopLossPct_x100 = Math.round((pred.stop_loss_pct || 0) * 100);
      const submittedAt = Number(pred.submitted_at || 0);
      const notes = pred.notes || "";

      setStatus('发送 reveal 交易...');
      const tx = await ledger.revealPrediction(
        predictionJson,
        salt,
        asset,
        direction,
        targetPrice,
        targetChangePct_x100,
        submittedPrice,
        timeframeHours,
        confidence_x100,
        stopLossPct_x100,
        submittedAt,
        notes
      );
      setStatus('等待交易确认: ' + tx.hash);
      await tx.wait();
      setStatus('已揭示，交易: ' + tx.hash);

      // remove local copy
      localStorage.removeItem(item.key);
      setItems(items.filter(it => it.key !== item.key));
      setSelected(null);
    } catch (err) {
      console.error(err);
      setStatus('错误: ' + (err.message || err));
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Reveal Prediction</h1>
      {items.length === 0 && <p>本地无待揭示的 prediction（请在提交页面生成并保存）。</p>}
      {items.length > 0 && (
        <div>
          <label>选择待揭示的 Commit</label>
          <select onChange={e => setSelected(items.find(it => it.key === e.target.value))}>
            {items.map(it => (
              <option key={it.key} value={it.key}>{it.key}</option>
            ))}
          </select>
        </div>
      )}

      {selected && (
        <div style={{ marginTop: 20 }}>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(selected.prediction, null, 2)}</pre>
          <button onClick={() => onReveal(selected)}>Reveal on-chain</button>
          <p>{status}</p>
        </div>
      )}
    </div>
  );
}
