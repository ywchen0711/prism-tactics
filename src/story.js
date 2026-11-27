// Story scenes and the Scales of Conviction vote.
import { characterFrames } from './pixelart.js';
import { SPECS } from './data.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);

const CAST = {
  seren: { name: '賽倫', spec: 'seren', title: '沃爾德家少主' },
  roland: { name: '羅蘭', spec: 'roland', title: '騎士' },
  fid: { name: '菲德', spec: 'fid', title: '獵人' },
  corti: { name: '寇蒂', spec: 'corti', title: '流浪術士' },
  ely: { name: '伊莉', spec: 'ely', title: '修道院治療師' },
  benny: { name: '班尼', spec: 'benny', title: '老管家' },
  bard: { name: '巴德', spec: 'general', title: '黑鋼將軍' },
};

const portraits = {};
function portrait(id) {
  if (!portraits[id]) portraits[id] = characterFrames(SPECS[CAST[id].spec]).front[0].toCanvas().toDataURL();
  return portraits[id];
}

export const INTRO = [
  [null, '鹽之大陸·諾爾維亞。三個國家，靠著鹽與鐵維繫著脆弱的和平。'],
  [null, '直到灰岩帝國的鐵蹄越過北境，一夜之間奪下了扼守王國命脈的——鹽橋要塞。'],
  ['seren', '要塞一日不奪回，南方的村莊就一日不得安寧。我們必須在帝國援軍抵達前動手。'],
  ['roland', '少主，騎士的榮耀在於正面迎戰。趁黎明列陣，堂堂正正地奪回要塞吧！'],
  ['fid', '榮耀能當飯吃嗎？今晚是新月，從西側淺灘摸過去，守軍多半還在睡夢中。'],
  ['corti', '……夜襲的勝算確實比較高。不過，我想先聽聽你的想法，賽倫。'],
  ['ely', '無論選哪一條路，我只希望大家都能活著回來。'],
  ['benny', '依沃爾德家的傳統，重大的決定必須交由「信念天秤」表決。少主，請說服大家吧。'],
];

export const AFTER_VOTE = {
  A: [
    ['benny', '天秤已然傾斜——我們將於黎明時分，從正面突破鹽橋要塞。'],
    ['roland', '這才是沃爾德家的作風！我的長槍為少主開路。'],
    ['fid', '唉，好吧。至少天亮了，我的箭不會射歪。'],
    ['bard', '哼，竟敢光明正大地前來送死？全軍列陣！讓他們見識帝國的鐵壁！'],
  ],
  B: [
    ['benny', '天秤已然傾斜——今夜新月，我們將從西側淺灘發動奇襲。'],
    ['fid', '就是這樣。腳步放輕，別踩到碎石。'],
    ['corti', '淺灘和濕沙都會導電……我的落雷會很有用的。'],
    ['bard', '……什麼聲音？敵襲！敵襲！全都給我起來！'],
  ],
};

export const VICTORY = [
  ['bard', '咕……沒想到，竟會敗在這種小鬼手上……撤退！全軍撤退！'],
  ['seren', '鹽橋要塞，奪回來了。'],
  ['ely', '大家都辛苦了。來，受傷的人先到我這裡。'],
  ['benny', '少主，今日的抉擇將被記入家族史冊。但願信念之秤，永遠指引您正確的方向。'],
];

export const DEFEAT = [
  ['seren', '可惡……我的信念……還不夠堅定嗎……'],
  [null, '沃爾德家的旗幟倒下了。然而，命運的天秤，仍可以重新衡量。'],
];

// ------------------------------------------------------------------ dialogue
let skipAll = false;
export function setSkip(v) {
  skipAll = v;
}

function say(who, text) {
  if (skipAll) return Promise.resolve();
  const box = $('dialogue');
  const c = who ? CAST[who] : null;
  box.classList.add('show');
  box.classList.toggle('narr', !c);
  $('dlgPortrait').src = c ? portrait(who) : '';
  $('dlgPortrait').style.display = c ? '' : 'none';
  $('dlgName').innerHTML = c ? `${c.name}<small>${c.title}</small>` : '';
  const el = $('dlgText');
  el.textContent = '';
  return new Promise((resolve) => {
    let i = 0;
    let done = false;
    const timer = setInterval(() => {
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(timer);
        done = true;
      }
    }, 28);
    const next = (e) => {
      if (e.type === 'keydown' && !['Enter', ' ', 'z', 'Z'].includes(e.key)) return;
      if (e.type === 'keydown') e.preventDefault();
      if (!done) {
        clearInterval(timer);
        el.textContent = text;
        done = true;
        return;
      }
      box.removeEventListener('click', next);
      window.removeEventListener('keydown', next);
      sfx('select');
      resolve();
    };
    box.addEventListener('click', next);
    window.addEventListener('keydown', next);
  });
}

export async function play(lines) {
  for (const [who, text] of lines) await say(who, text);
  $('dialogue').classList.remove('show');
}

// ------------------------------------------------------------------ Scales of Conviction
const OPTIONS = {
  A: { title: '黎明突破', sub: '正面進攻，堂堂正正地奪回要塞', value: '道義' },
  B: { title: '新月夜襲', sub: '趁夜色從淺灘奇襲沉睡的守軍', value: '實利' },
};

const VOTERS = [
  {
    id: 'roland', lean: 'A',
    args: [
      ['夜襲能把雙方的傷亡降到最低——包括那些被強徵入伍的帝國農民。', true],
      ['騎士精神只是過時的包袱。', false],
      ['菲德都這麼說了，你就聽他的吧。', false],
    ],
    yes: '……若能少流一些無辜之血，騎士之劍也願意藏於夜色之中。這一票，投給夜襲。',
    no: '少主，恕我無法認同這種說法。',
  },
  {
    id: 'fid', lean: 'B',
    args: [
      ['黎明時我們能先佔住南側高地，你的箭能射得更遠、更準。', true],
      ['偷襲太卑鄙了，這不是正道。', false],
      ['相信我就對了。', false],
    ],
    yes: '……居高臨下嗎？算盤打得不錯。好，這一票給你。',
    no: '正道？那玩意能換回幾條命？',
  },
  {
    id: 'corti', lean: 'B',
    args: [
      ['光明正大地進攻，讓被佔領的百姓親眼看見我們——讓他們自己選擇要站在哪一邊。', true],
      ['夜裡太危險了，妳會害怕的。', false],
      ['這是命令。', false],
    ],
    yes: '讓人們自己選擇……嗯，我喜歡這個答案。我改投黎明突破。',
    no: '……命令？我可不是誰的部下。',
  },
  {
    id: 'ely', lean: 'A',
    args: [
      ['夜襲時敵人大多還在睡夢中，大家受傷的機會最小。', true],
      ['打仗本來就會有人犧牲。', false],
      ['妳不懂戰術，就別插嘴了。', false],
    ],
    yes: '如果這樣能讓大家平安回來……我願意相信你。',
    no: '……我不想聽到這種話。',
  },
  {
    id: 'benny', lean: 'A',
    args: [
      ['先祖奧斯華公爵當年，正是以一場夜襲奪回了這座要塞。', true],
      ['傳統早就該打破了。', false],
      ['你年紀大了，不懂這些。', false],
    ],
    yes: '呵呵……少主竟然記得這段家史。老朽就投夜襲一票吧。',
    no: '少主，請恕老朽無法苟同。',
  },
];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function scales() {
  return new Promise((resolve) => {
    const root = $('scales');
    const state = VOTERS.map((v) => ({ ...v, vote: v.lean, tried: false }));
    let pref = null;

    const tally = () => ({ A: state.filter((s) => s.vote === 'A').length, B: state.filter((s) => s.vote === 'B').length });

    const render = (msg) => {
      const t = tally();
      root.innerHTML = `
        <div class="sc-wrap panel">
          <div class="sc-title">信念天秤</div>
          <div class="sc-q">如何奪回鹽橋要塞？</div>
          <div class="sc-opts">
            ${['A', 'B'].map((k) => `
              <button class="sc-opt ${pref === k ? 'picked' : ''}" data-opt="${k}" ${pref ? 'disabled' : ''}>
                <div class="o-t">${OPTIONS[k].title}</div><div class="o-s">${OPTIONS[k].sub}</div>
                <div class="o-v">${OPTIONS[k].value}</div>
              </button>`).join('')}
          </div>
          <div class="sc-hint">${pref ? '說服立場不同的同伴，再進行表決。每人只能說服一次。' : '首先，選擇你心中傾向的道路。'}</div>
          <div class="sc-voters">
            ${state.map((s, i) => `
              <div class="voter ${s.vote === pref ? 'agree' : ''}">
                <img src="${portrait(s.id)}" alt="">
                <div class="vn">${CAST[s.id].name}</div>
                <div class="vl">${pref ? (s.vote === pref ? '贊同' : '反對') : '？'}</div>
                ${pref && s.vote !== pref && !s.tried ? `<button class="vbtn" data-talk="${i}">說服</button>` : ''}
              </div>`).join('')}
          </div>
          <div class="sc-msg">${msg || ''}</div>
          ${pref ? `<button class="sc-go" id="scGo">進行表決</button>` : ''}
          <div class="sc-count">目前傾向：${OPTIONS.A.title} ${t.A}　｜　${OPTIONS.B.title} ${t.B}</div>
        </div>`;
      root.querySelectorAll('[data-opt]').forEach((b) =>
        b.addEventListener('click', () => {
          sfx('select');
          pref = b.dataset.opt;
          render();
        }),
      );
      root.querySelectorAll('[data-talk]').forEach((b) => b.addEventListener('click', () => talk(+b.dataset.talk)));
      const go = $('scGo');
      if (go) go.addEventListener('click', vote);
    };

    const talk = (i) => {
      sfx('select');
      const s = state[i];
      const box = root.querySelector('.sc-msg');
      box.innerHTML = `<div class="talk"><img src="${portrait(s.id)}" alt=""><div><b>${CAST[s.id].name}</b>：「你想說什麼？」</div></div>
        <div class="args">${shuffle(s.args.slice()).map(([t, ok]) => `<button class="arg" data-ok="${ok ? 1 : 0}">「${t}」</button>`).join('')}</div>`;
      box.querySelectorAll('.arg').forEach((b) =>
        b.addEventListener('click', () => {
          s.tried = true;
          const ok = b.dataset.ok === '1';
          if (ok) s.vote = pref;
          sfx(ok ? 'buff' : 'cancel');
          render(`<div class="talk"><img src="${portrait(s.id)}" alt=""><div><b>${CAST[s.id].name}</b>：「${ok ? s.yes : s.no}」</div></div>`);
        }),
      );
    };

    const vote = async () => {
      sfx('select');
      root.innerHTML = `
        <div class="sc-wrap panel">
          <div class="sc-title">表決</div>
          <svg class="balance" viewBox="0 0 400 220">
            <polygon points="200,40 185,200 215,200" fill="#7a6a4a" />
            <rect x="150" y="196" width="100" height="10" rx="3" fill="#5a4a30" />
            <g id="beam">
              <rect x="50" y="34" width="300" height="8" rx="4" fill="#d8b46a" />
              <g id="panA"><line x1="60" y1="38" x2="40" y2="110" stroke="#c9a55a"/><line x1="60" y1="38" x2="80" y2="110" stroke="#c9a55a"/><path d="M28 110 Q60 140 92 110 Z" fill="#b8944a"/><text x="60" y="160" text-anchor="middle">${OPTIONS.A.title}</text></g>
              <g id="panB"><line x1="340" y1="38" x2="320" y2="110" stroke="#c9a55a"/><line x1="340" y1="38" x2="360" y2="110" stroke="#c9a55a"/><path d="M308 110 Q340 140 372 110 Z" fill="#b8944a"/><text x="340" y="160" text-anchor="middle">${OPTIONS.B.title}</text></g>
            </g>
            <circle cx="200" cy="38" r="9" fill="#f5dfa6" />
          </svg>
          <div class="sc-voters reveal"></div>
          <div class="sc-result"></div>
        </div>`;
      const beam = root.querySelector('#beam');
      const panA = root.querySelector('#panA');
      const panB = root.querySelector('#panB');
      const row = root.querySelector('.reveal');
      let a = 0;
      let b = 0;
      for (const s of state) {
        await new Promise((r) => setTimeout(r, 650));
        if (s.vote === 'A') a++;
        else b++;
        sfx('coin');
        const ang = Math.max(-14, Math.min(14, (b - a) * 5));
        beam.setAttribute('transform', `rotate(${ang} 200 38)`);
        panA.setAttribute('transform', `rotate(${-ang} 60 38)`);
        panB.setAttribute('transform', `rotate(${-ang} 340 38)`);
        row.insertAdjacentHTML('beforeend', `<div class="voter pop"><img src="${portrait(s.id)}" alt=""><div class="vn">${CAST[s.id].name}</div><div class="vl">${OPTIONS[s.vote].title}</div></div>`);
      }
      const result = a > b ? 'A' : 'B';
      await new Promise((r) => setTimeout(r, 600));
      sfx('victory');
      root.querySelector('.sc-result').innerHTML = `天秤傾向——<b>${OPTIONS[result].title}</b>（${a} : ${b}）<br><button class="sc-go" id="scDone">繼續</button>`;
      $('scDone').addEventListener('click', () => {
        sfx('select');
        root.classList.remove('show');
        resolve(result);
      });
    };

    root.classList.add('show');
    render();
  });
}
