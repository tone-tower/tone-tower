export async function pausePageClock(page) {
  const clientTime = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(clientTime + 10000);
}

export function fakeTime() {
  let time = 0,
    id = 0;
  const tasks = new Map();
  return {
    now: () => time,
    setTimeout: (fn, delay) => {
      tasks.set(++id, { fn, at: time + delay });
      return id;
    },
    clearTimeout: (key) => tasks.delete(key),
    advance(ms) {
      const end = time + ms;
      while (true) {
        const next = [...tasks]
          .filter(([, task]) => task.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at;
        tasks.delete(next[0]);
        next[1].fn();
      }
      time = end;
    },
    get pending() {
      return tasks.size;
    },
  };
}
