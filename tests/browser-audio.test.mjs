import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const classSource = source.slice(
  source.indexOf('class BrowserAudio'),
  source.indexOf('class BrowserAudioMixer'),
);
const pending = [];
let starts = 0;
class AudioContext {
  state = 'running';
  currentTime = 0;
  decodeAudioData() {
    return new Promise((resolve) => pending.push(resolve));
  }
  createGain() {
    return { gain: { value: 1 }, connect() {} };
  }
  createBufferSource() {
    return {
      connect() {},
      disconnect() {},
      start() {
        starts++;
      },
      stop() {},
    };
  }
}
const sandbox = {
  window: { AudioContext },
  soundEnabled: true,
  running: true,
  log() {},
  $() {
    return {};
  },
  Uint8Array,
  ArrayBuffer,
};
vm.createContext(sandbox);
vm.runInContext(classSource + '\nglobalThis.audio = new BrowserAudio();', sandbox);
const audio = sandbox.audio;
audio.unlock();
let play = audio.receive({ action: 'play', bytes: new Uint8Array([1]) });
audio.pause();
pending.shift()({ duration: 10 });
await play;
assert.equal(starts, 0, 'Pause while decoding must suppress playback');
audio.resume();
assert.equal(starts, 1);
play = audio.receive({ action: 'play', bytes: new Uint8Array([1]) });
audio.pause();
audio.resume();
pending.shift()({ duration: 10 });
await play;
assert.equal(starts, 2, 'Resume before decoder completes must restore playback intent');
play = audio.receive({ action: 'play', bytes: new Uint8Array([1]) });
audio.stop();
pending.shift()({ duration: 10 });
await play;
assert.equal(starts, 2, 'Stopped audio must not restart when its decode finishes');
assert.equal(audio.buffer, null);
console.log('Audio async pause/resume/stop race checks passed.');

await audio.receive({ action: 'volume', value: 0.3 });
assert.equal(audio.gain.gain.value, 0.3);

const mixerSource = source.slice(
  source.indexOf('class BrowserAudioMixer'),
  source.indexOf('const audio = new BrowserAudioMixer'),
);
vm.runInContext(mixerSource + '\nglobalThis.mixer = new BrowserAudioMixer();', sandbox);
const mixer = sandbox.mixer;
mixer.unlock();
mixer.receive({ action: 'play', channel: 0, bytes: new Uint8Array([1]) });
mixer.receive({ action: 'play', channel: 1, bytes: new Uint8Array([2]) });
pending.shift()({ duration: 10 });
pending.shift()({ duration: 8 });
await new Promise((resolve) => setImmediate(resolve));
assert.ok(mixer.track(0).node && mixer.track(1).node, 'Independent sound channels must mix');
assert.equal(mixer.track(0).context, mixer.track(1).context);
mixer.receive({ action: 'volume', channel: 1, value: 0.2 });
assert.equal(mixer.track(1).gain.gain.value, 0.2);
assert.equal(mixer.track(0).gain.gain.value, 1);
mixer.receive({ action: 'pause', channel: 1 });
assert.ok(mixer.track(0).node);
assert.equal(mixer.track(1).node, null);
mixer.receive({ action: 'resume', channel: 1 });
assert.ok(mixer.track(1).node);
mixer.stop();
assert.equal(mixer.node, false);
assert.equal(mixer.buffer, false);
