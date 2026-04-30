/* ═══════════════════════════════════════════════════════════════
   CLARK - Audio Feedback
   Audio beep helpers for QR scanning feedback.
   Uses Web Audio API — no external dependencies.
   ═══════════════════════════════════════════════════════════════ */

/* Module-level audio context cache (singleton across app lifetime) */
const _audioCtx={c:null};

export function playBeep(type){try{if(!_audioCtx.c)_audioCtx.c=new(window.AudioContext||window.webkitAudioContext)();const c=_audioCtx.c;if(c.state==="suspended")c.resume();const o=c.createOscillator();const g=c.createGain();o.connect(g);g.connect(c.destination);
  if(type==="ok"){o.frequency.value=880;g.gain.value=0.3;o.start();o.stop(c.currentTime+0.12)}
  else if(type==="dup"){o.frequency.value=220;o.type="square";g.gain.value=0.2;o.start();o.stop(c.currentTime+0.3)}
  else if(type==="error"){o.frequency.value=200;o.type="square";g.gain.value=0.4;o.start();o.stop(c.currentTime+0.5)}
  else{o.frequency.value=1200;g.gain.value=0.2;o.start();setTimeout(()=>{const o2=c.createOscillator();const g2=c.createGain();o2.connect(g2);g2.connect(c.destination);o2.frequency.value=1500;g2.gain.value=0.2;o2.start();o2.stop(c.currentTime+0.1)},150);o.stop(c.currentTime+0.1)}
}catch(e){}}
