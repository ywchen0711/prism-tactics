// Headless balance check: both sides are played by the AI with all rendering stubbed out.
// Usage: node tools/simulate.mjs [games]
import { Battle } from '../src/battle.js';
import { GameMap } from '../src/map.js';
import { makeScenario } from '../src/data.js';
import { timeScale } from '../src/util.js';

timeScale.instant = true;
const stub = new Proxy(function () {}, {
  get: (_, p) => (p === 'then' ? undefined : stub),
  apply: () => stub,
});

const games = +(process.argv[2] || 100);
for (const choice of ['A', 'B']) {
  const tally = { victory: 0, defeat: 0, draw: 0 };
  let turns = 0;
  let survivors = 0;
  for (let i = 0; i < games; i++) {
    const map = new GameMap();
    const b = new Battle({ map, world: stub, fx: stub, ui: stub, scenario: makeScenario(choice), auto: true });
    const r = await b.run();
    tally[r]++;
    turns += b.turn;
    survivors += b.allies.length;
  }
  console.log(choice === 'A' ? 'Dawn assault' : 'Night raid', tally, 'avg turns', (turns / games).toFixed(1), 'avg ally survivors', (survivors / games).toFixed(2));
}
