/** Host deadlines for the three independent GNEX event timers. */
export class TimerScheduler {
  constructor() {
    this.deadlines = new Map();
  }
  sync(states, now, firedChannel = null) {
    const active = new Set();
    for (const state of states) {
      if (!(state.delay > 0)) continue;
      active.add(state.channel);
      const previous = this.deadlines.get(state.channel);
      if (!previous || previous.revision !== state.revision || state.channel === firedChannel) {
        this.deadlines.set(state.channel, { ...state, at: now + state.delay });
      }
    }
    for (const channel of this.deadlines.keys())
      if (!active.has(channel)) this.deadlines.delete(channel);
  }
  next() {
    return (
      [...this.deadlines.values()].sort((a, b) => a.at - b.at || a.channel - b.channel)[0] || null
    );
  }
  shift(milliseconds) {
    for (const timer of this.deadlines.values()) timer.at += milliseconds;
  }
}
