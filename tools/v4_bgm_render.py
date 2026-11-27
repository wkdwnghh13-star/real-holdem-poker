#!/usr/bin/env python3
"""BGM을 OfflineAudioContext 로 렌더해 WAV로 저장 (음질/레벨 확인용)"""
import asyncio, os, base64, json
os.environ["LD_LIBRARY_PATH"] = "/workspace/.chromelibs/root/usr/lib/x86_64-linux-gnu:" + os.environ.get("LD_LIBRARY_PATH", "")
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file://" + os.path.abspath(os.path.join(ROOT, "..", "..", "downloads", "holdem_poker_play.html"))
TMP = os.path.abspath(os.path.join(ROOT, "..", "..", "tmp"))

JS = """async () => {
  const sr = 22050, dur = 12;
  const off = new OfflineAudioContext(1, sr * dur, sr);
  const master = off.createGain(); master.gain.value = 0.7; master.connect(off.destination);
  const save = { ctx: Sound.ctx, master: Sound.master, bus: Sound._bus, wet: Sound._wet, wob: Sound._wob, wo: Sound._wobOsc, vin: Sound._vinyl };
  Sound.ctx = off; Sound.master = master;
  Sound._bus = null; Sound._wet = null; Sound._wob = null; Sound._wobOsc = null; Sound._vinyl = null;
  const st = Sound.bgmStyleDef();
  Sound._buildBus(st);
  const stepDur = 30 / st.bpm;
  const steps = Math.floor(dur / stepDur);
  for (let i = 0; i < steps; i++) Sound._bgmStep(st, i, 0.06 + i * stepDur, stepDur);
  const buf = await off.startRendering();
  Sound.ctx = save.ctx; Sound.master = save.master;
  Sound._bus = save.bus; Sound._wet = save.wet; Sound._wob = save.wob; Sound._wobOsc = save.wo; Sound._vinyl = save.vin;
  const d = buf.getChannelData(0);
  let peak = 0, sum = 0, nan = 0;
  for (let i = 0; i < d.length; i++) { const v = d[i]; if (!isFinite(v)) nan++; peak = Math.max(peak, Math.abs(v)); sum += v * v; }
  // 16bit PCM WAV → base64
  const len = d.length, ab = new ArrayBuffer(44 + len * 2), dv = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + len * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) { let v = Math.max(-1, Math.min(1, d[i])); dv.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
  const bytes = new Uint8Array(ab); let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return { peak, rms: Math.sqrt(sum / len), nan, b64: btoa(bin), steps, bpm: st.bpm };
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto(URL)
        await page.wait_for_timeout(600)
        r = await page.evaluate(JS)
        path = os.path.join(TMP, "lofi_render.wav")
        with open(path, "wb") as f:
            f.write(base64.b64decode(r["b64"]))
        print(json.dumps({k: v for k, v in r.items() if k != "b64"}, ensure_ascii=False), "errors:", errs)
        await b.close()

asyncio.run(main())
