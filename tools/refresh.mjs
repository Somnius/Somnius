// Daily refresh for the profile: draws assets/stats.svg from public GitHub data and writes the
// newest lefteros.com posts into README.md (English feed) and README.el.md (Greek feed).
// Node 20+, no dependencies. Needs GITHUB_TOKEN (the Actions token is enough).
//
//   GITHUB_TOKEN=$(gh auth token) node tools/refresh.mjs
import fs from 'node:fs';

const USER = 'Somnius';
const POSTS = 5;
const token = process.env.GITHUB_TOKEN;
if (!token) { console.error('GITHUB_TOKEN is required'); process.exit(2); }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unxml = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const fmt = (n) => n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString('en-US');

// ---- Stats ----
const query = `query($login: String!) { user(login: $login) {
  createdAt followers { totalCount }
  contributionsCollection { contributionCalendar { totalContributions } restrictedContributionsCount }
  repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false) {
    totalCount nodes { stargazerCount forkCount languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } } }
  } } }`;
const res = await fetch('https://api.github.com/graphql', {
  method: 'POST', headers: { Authorization: `bearer ${token}`, 'User-Agent': USER },
  body: JSON.stringify({ query, variables: { login: USER } }),
});
const { data, errors } = await res.json();
if (errors || !data?.user) { console.error(JSON.stringify(errors ?? data)); process.exit(1); }
const u = data.user;
const repos = u.repositories.nodes;
const langs = new Map();
for (const r of repos) for (const e of r.languages.edges) {
  const l = langs.get(e.node.name) ?? { size: 0, color: e.node.color ?? '#a3afa5' };
  l.size += e.size; langs.set(e.node.name, l);
}
const total = [...langs.values()].reduce((a, l) => a + l.size, 0) || 1;
const top = [...langs].sort((a, b) => b[1].size - a[1].size).slice(0, 6).map(([name, l]) => ({ name, color: l.color, pct: (l.size / total) * 100 }));
const years = Math.floor((Date.now() - new Date(u.createdAt)) / (365.25 * 864e5));
const cal = u.contributionsCollection;
const tiles = [
  ['Stars earned', repos.reduce((a, r) => a + r.stargazerCount, 0)],
  ['Public repos', u.repositories.totalCount],
  ['Contributions, 1 yr', cal.contributionCalendar.totalContributions + cal.restrictedContributionsCount],
  ['Followers', u.followers.totalCount],
  ['Forks by others', repos.reduce((a, r) => a + r.forkCount, 0)],
  ['Years on GitHub', years],
];

const F = `font-family="'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace"`;
let x = 380;
const bar = top.map((l) => { const w = Math.max(2, (l.pct / 100) * 760); const r = `<rect x="${x.toFixed(1)}" y="120" width="${w.toFixed(1)}" height="14" fill="${l.color}"/>`; x += w; return r; }).join('');
const legend = top.map((l, i) => `<g transform="translate(${380 + (i % 2) * 380} ${170 + Math.floor(i / 2) * 36})"><rect width="12" height="12" y="-11" fill="${l.color}"/><text x="24" font-size="16" fill="#eef0e8">${esc(l.name)} <tspan fill="#a3afa5">${l.pct.toFixed(1)}%</tspan></text></g>`).join('');
const tileSvg = tiles.map(([label, n], i) => `<g transform="translate(40 ${116 + i * 36})"><text font-size="22" font-weight="700" fill="#c2f66d">${fmt(n)}</text><text x="100" font-size="15" fill="#a3afa5">${esc(label)}</text></g>`).join('');
const updated = new Date().toISOString().slice(0, 10);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="340" viewBox="0 0 1200 340" ${F}>
<rect width="1200" height="340" fill="#111513"/><rect x="1" y="1" width="1198" height="338" fill="none" stroke="#303a32" stroke-width="2"/>
<text x="40" y="62" font-size="15" letter-spacing="4" fill="#a3afa5">GITHUB · @${USER.toUpperCase()}</text>
<text x="380" y="62" font-size="15" letter-spacing="4" fill="#a3afa5">LANGUAGES IN PUBLIC REPOS</text>
<line x1="350" y1="44" x2="350" y2="300" stroke="#303a32" stroke-width="2"/>
${tileSvg}${bar}${legend}
<rect x="40" y="306" width="120" height="6" fill="#c2f66d"/>
<text x="1160" y="312" font-size="13" fill="#a3afa5" text-anchor="end">updated ${updated} · lefteros<tspan fill="#c2f66d">_</tspan></text>
</svg>
`;
fs.writeFileSync('assets/stats.svg', svg);
console.log('assets/stats.svg', Object.fromEntries(tiles));

// ---- Latest posts from lefteros.com ----
async function posts(feed, locale) {
  const xml = await (await fetch(feed)).text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, POSTS).map(([, item]) => {
    const tag = (t) => unxml(item.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1] ?? '').trim();
    const date = tag('pubDate') ? new Date(tag('pubDate')).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    return `- [${tag('title').replace(/[[\]]/g, '')}](${tag('link')})${date ? ` · <sub>${date}</sub>` : ''}`;
  }).join('\n');
}
for (const [file, feed, locale] of [['README.md', 'https://lefteros.com/en/rss.xml', 'en-GB'], ['README.el.md', 'https://lefteros.com/rss.xml', 'el-GR']]) {
  const list = await posts(feed, locale);
  if (!list) { console.error(`no posts from ${feed}, leaving ${file} as it is`); continue; }
  const md = fs.readFileSync(file, 'utf8');
  const next = md.replace(/(<!-- POSTS:START -->)[\s\S]*?(<!-- POSTS:END -->)/, `$1\n${list}\n$2`);
  fs.writeFileSync(file, next);
  console.log(file, next === md ? 'unchanged' : 'updated');
}
