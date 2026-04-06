#!/usr/bin/env node
/**
 * OpenRouter Token Tracker
 * Fetches daily and weekly ranking data from openrouter.ai/rankings
 *
 * Usage: node scraper.js
 * Output: data.json, dashboard.html
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');
const HTML_FILE = path.join(__dirname, 'dashboard.html');

const TARGET_MODELS = {
  'xiaomi/mimo-v2-pro-20260318': { name: 'MiMo v2 Pro', short: 'MiMo Pro', color: '#FF6B35' },
  'xiaomi/mimo-v2-omni-20260318': { name: 'MiMo v2 Omni', short: 'MiMo Omni', color: '#E91E63' },
  'xiaomi/mimo-v2-flash-20251210': { name: 'MiMo v2 Flash', short: 'MiMo Flash', color: '#9C27B0' },
  'minimax/minimax-m2.7-20260318': { name: 'MiniMax 2.7', short: 'MiniMax', color: '#2196F3' },
  'deepseek/deepseek-v3.2-20251201': { name: 'DeepSeek v3.2', short: 'DeepSeek', color: '#4CAF50' },
  'moonshotai/kimi-k2.5-0127': { name: 'Kimi 2.5', short: 'Kimi', color: '#FF9800' },
  'z-ai/glm-5-turbo-20260315': { name: 'GLM-5 Turbo', short: 'GLM-5', color: '#00BCD4' },
};

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).setTimeout(30000, function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

function parseEntries(html) {
  const entries = [];
  const pushRegex = /self\.__next_f\.push\(\[1,"(.*?)"\]\)/gs;
  let match;
  while ((match = pushRegex.exec(html)) !== null) {
    const raw = match[1];
    if (!raw.includes('total_prompt_tokens')) continue;
    let u = raw
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\\\"/g, '"').replace(/\\"/g, '"');
    const re = /\{"date":"([^"]+)","model_permaslug":"([^"]+)","variant":"([^"]+)","total_completion_tokens":(\d+),"total_prompt_tokens":(\d+),"total_native_tokens_reasoning":(\d+),"count":(\d+),"num_media_prompt":(\d+),"num_media_completion":(\d+),"num_audio_prompt":(\d+),"total_native_tokens_cached":(\d+),"total_tool_calls":(\d+),"requests_with_tool_call_errors":(\d+),"variant_permaslug":"([^"]+)","change":([^}]+)\}/g;
    let em;
    while ((em = re.exec(u)) !== null) {
      entries.push({
        date: em[1], slug: em[2],
        completion: +em[4], prompt: +em[5], reasoning: +em[6], count: +em[7],
      });
    }
  }
  return entries;
}

function loadData() {
  try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch {}
  return { daily: {}, weekly: {}, lastUpdated: null };
}

function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

function fmt(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return '' + n;
}

function generateDashboard(data) {
  const mc = TARGET_MODELS;
  const slugs = Object.keys(mc);
  const dailyDates = Object.keys(data.daily).sort();
  const weekDates = Object.keys(data.weekly).sort();
  const today = dailyDates[dailyDates.length - 1] || new Date().toISOString().substring(0, 10);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenRouter Token Tracker</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f7;color:#1a1a2e;min-height:100vh}
.hdr{background:linear-gradient(135deg,#ffffff,#f0f0f3);border-bottom:1px solid #e0e0e6;padding:20px 32px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.hdr h1{font-size:20px;font-weight:700}
.hdr-right{display:flex;align-items:center;gap:16px}
.meta{font-size:12px;color:#999;text-align:right}
.box{max-width:1400px;margin:0 auto;padding:24px 32px}
.tabs{display:flex;gap:2px;margin-bottom:20px;background:#fff;border-radius:10px;padding:3px;width:fit-content;border:1px solid #e0e0e6}
.tab{padding:7px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;border:none;background:transparent;color:#999;transition:all .2s}
.tab.on{background:#e8e8ed;color:#60a5fa}
.tab:hover:not(.on){color:#1a1a2e}
.sec{background:#fff;border-radius:14px;padding:20px;margin-bottom:20px;border:1px solid #e0e0e6}
.sec h2{font-size:15px;font-weight:600;margin-bottom:2px}
.sec .sub{font-size:12px;color:#999;margin-bottom:14px}
.cw{position:relative;height:380px}
.leg{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;justify-content:center}
.li{display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:16px;cursor:pointer;font-size:12px;font-weight:500;background:#f0f0f3;border:2px solid transparent;transition:all .15s;user-select:none}
.li:hover{background:#e0e0e8}
.li.off{opacity:.3}
.dt{width:8px;height:8px;border-radius:50%;flex-shrink:0}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:10px 12px;border-bottom:2px solid #e0e0e6;color:#666;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
td{padding:8px 12px;border-bottom:1px solid #e0e0e6}
tr:hover td{background:#f8f8fa}
.nr{text-align:right;font-variant-numeric:tabular-nums}
@media(max-width:768px){.hdr{padding:14px 16px;flex-direction:column;gap:8px}.hdr-right{width:100%;justify-content:space-between}.box{padding:16px}.cw{height:280px}.dp{flex-direction:column;align-items:flex-start}}
.dp{display:flex;align-items:center;gap:6px}
.dp input[type=date]{padding:5px 8px;border:1px solid #e0e0e6;border-radius:6px;background:#fff;color:#1a1a2e;font-size:12px;font-family:inherit}
.dp span{font-size:12px;color:#999}
.db{padding:5px 14px;border:1px solid #60a5fa;border-radius:6px;background:#60a5fa22;color:#60a5fa;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s}
.db:hover{background:#60a5fa44}
</style>
</head>
<body>
<div class="hdr">
  <h1>📊 OpenRouter Token Tracker</h1>
  <div class="hdr-right">
    <div class="meta">
      <div>更新: ${data.lastUpdated ? new Date(data.lastUpdated).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}) : '无数据'}</div>
      <div>${dailyDates.length} 天数据 · 每日 ${slugs.length} 款模型</div>
    </div>
  </div>
</div>
<div class="box">
  <div class="tabs">
    <button class="tab on" data-v="daily" onclick="go('daily')">Daily</button>
    <button class="tab" data-v="week" onclick="go('week')">Weekly</button>
  </div>
  <div class="sec">
    <h2 id="t1"></h2>
    <p class="sub" id="s1"></p>
    <div class="cw"><canvas id="c1"></canvas></div>
    <div class="leg" id="leg"></div>
  </div>
  <div class="sec">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <div><h2 style="display:inline">详细数据</h2><span class="sub" style="margin-left:8px">日 Tokens 调用量</span></div>
      <div style="display:flex;align-items:center;gap:8px">
        <button class="db" onclick="toggleRank()" id="rankBtn">Rank ↓</button>
        <div class="dp"><input type="date" id="df" value=""><span>至</span><input type="date" id="dt" value=""><button class="db" onclick="applyRange()">确定</button></div>
      </div>
    </div>
    <div style="overflow-x:auto"><table id="tbl"></table></div>
  </div>
</div>
<script>
const MC=${JSON.stringify(mc)};
const DL=${JSON.stringify(data.daily)};
const WL=${JSON.stringify(data.weekly)};
const DD=${JSON.stringify(dailyDates)};
const WD=${JSON.stringify(weekDates)};
let vw='daily',ch1=null,hd=new Set(),customRange=null,ranked=false;

function gridC(){return '#e0e0e6'}
function tickC(){return '#999'}
function ptBorder(){return '#ffffff'}
function tipBg(){return '#ffffffee'}
function tipTx(){return '#1a1a2e'}
function tipBd(){return '#d0d0d8'}

function ft(n){if(n>=1e12)return(n/1e12).toFixed(2)+'T';if(n>=1e9)return(n/1e9).toFixed(1)+'B';if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return(n/1e3).toFixed(1)+'K';return''+n}

function getData(){
  if(vw==='daily'){
    if(customRange){
      const out={};
      for(const dt of DD){if(DL[dt]&&dt>=customRange.from&&dt<=customRange.to)out[dt]=DL[dt]}
      return out;
    }
    const out={};for(const dt of DD){if(DL[dt])out[dt]=DL[dt]}return out;
  }
  const out={};for(const dt of WD.slice(-7)){if(WL[dt])out[dt]=WL[dt]}return out;
}

function mkC(cv,ds,lb,key,formatter){
  return new Chart(cv.getContext('2d'),{type:'line',data:{labels:lb,datasets:ds.filter(d=>!hd.has(d.s)).map(d=>({
    label:d.l,data:d[key],borderColor:d.c,backgroundColor:d.c+'18',borderWidth:2.5,
    pointRadius:lb.length>1?4:7,pointHoverRadius:6,pointBackgroundColor:d.c,
    pointBorderColor:ptBorder(),pointBorderWidth:2,tension:.35,fill:true
  }))},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
  plugins:{legend:{display:false},tooltip:{backgroundColor:tipBg(),titleColor:tipTx(),bodyColor:tipTx(),
    borderColor:tipBd(),borderWidth:1,padding:10,bodyFont:{size:12},
    callbacks:{label:c=>c.dataset.label+': '+formatter(c.parsed.y)}}},
  scales:{x:{grid:{color:gridC(),drawBorder:false},ticks:{color:tickC(),font:{size:11}}},
    y:{grid:{color:gridC(),drawBorder:false},ticks:{color:tickC(),font:{size:11},callback:v=>formatter(v)},beginAtZero:true}}}});
}

function render(){
  const bk=getData();
  const ds2=Object.keys(bk).sort();
  const lb=ds2.map(d=>d.substring(5));
  const ds=[];
  for(const[s,c]of Object.entries(MC)){
    ds.push({s,l:c.short,c:c.color,
      tk:ds2.map(d=>bk[d]?.[s]?.tokens||0)
    });
  }
  const vl=vw==='daily'?'每日趋势':'每周趋势';
  document.getElementById('t1').textContent='Token 调用量 — '+vl;
  document.getElementById('s1').textContent=vw==='daily'?'每日各模型 Token 消耗量（Prompt + Completion）':'每周各模型 Token 消耗总量';
  if(ch1)ch1.destroy();
  ch1=mkC(document.getElementById('c1'),ds,lb,'tk',ft);
  const lg=document.getElementById('leg');lg.innerHTML='';
  for(const d of ds){
    const el=document.createElement('div');
    el.className='li'+(hd.has(d.s)?' off':'');
    el.innerHTML='<span class="dt" style="background:'+d.c+'"></span>'+d.l;
    el.onclick=()=>{if(hd.has(d.s))hd.delete(d.s);else if(hd.size<Object.keys(MC).length-1)hd.add(d.s);render()};
    lg.appendChild(el);
  }
  renderTable();
}

function renderTable(){
  const from=document.getElementById('df').value;
  const to=document.getElementById('dt').value;
  const dates=DD.filter(d=>(!from||d>=from)&&(!to||d<=to)).sort();

  // Compute totals per model
  const totals={};
  for(const s of Object.keys(MC)){totals[s]=0;}
  for(const d of dates){
    for(const s of Object.keys(MC)){
      const e=DL[d]?.[s];
      if(e)totals[s]+=e.tokens;
    }
  }

  // Sort models: keep original order or rank by total
  let models=Object.entries(MC);
  if(ranked){models.sort((a,b)=>totals[b[0]]-totals[a[0]]);}

  const tbl=document.getElementById('tbl');
  let h='<tr><th>日期</th>';for(const[,c]of models)h+='<th class="nr">'+c.short+'</th>';h+='</tr>';
  let b='';
  for(const d of [...dates].reverse()){
    b+='<tr><td>'+d+'</td>';
    for(const[s]of models){const e=DL[d]?.[s];b+='<td class="nr">'+(e?ft(e.tokens):'—')+'</td>';}
    b+='</tr>';
  }
  // Total row
  b+='<tr style="font-weight:700;border-top:2px solid #e0e0e6"><td>Total</td>';
  for(const[s]of models){b+='<td class="nr">'+(totals[s]?ft(totals[s]):'—')+'</td>';}
  b+='</tr>';
  tbl.innerHTML=h+b;
}

function toggleRank(){
  ranked=!ranked;
  document.getElementById('rankBtn').innerHTML=ranked?'Rank ↓':'Rank';
  document.getElementById('rankBtn').style.background=ranked?'#60a5fa':'#60a5fa22';
  document.getElementById('rankBtn').style.color=ranked?'#fff':'#60a5fa';
  renderTable();
}

function applyRange(){
  const from=document.getElementById('df').value;
  const to=document.getElementById('dt').value;
  if(from&&to){customRange={from,to};}else{customRange=null;}
  render();
}

function initDatePicker(){
  const all=DD.sort();
  if(!all.length)return;
  const end=all[all.length-1];
  const startIdx=Math.max(0,all.length-7);
  document.getElementById('df').value=all[startIdx];
  document.getElementById('dt').value=end;
  document.getElementById('df').min=all[0];
  document.getElementById('df').max=end;
  document.getElementById('dt').min=all[0];
  document.getElementById('dt').max=end;
}

function go(v){vw=v;customRange=null;document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on',t.dataset.v===v));initDatePicker();render()}
initDatePicker();render();
</script>
</body>
</html>`;
  fs.writeFileSync(HTML_FILE, html);
}

async function main() {
  console.log('🔄 Fetching OpenRouter rankings...\n');

  console.log('  📅 Fetching daily data...');
  let dayHtml;
  try { dayHtml = await fetchPage('https://openrouter.ai/rankings?view=day'); }
  catch(e) { console.error('❌ Failed:', e.message); process.exit(1); }
  const dayEntries = parseEntries(dayHtml);
  console.log(`     Found ${dayEntries.length} daily entries`);

  console.log('  📆 Fetching weekly data...');
  let weekHtml;
  try { weekHtml = await fetchPage('https://openrouter.ai/rankings?view=week'); }
  catch(e) { console.error('❌ Failed:', e.message); process.exit(1); }
  const weekEntries = parseEntries(weekHtml);
  console.log(`     Found ${weekEntries.length} weekly entries`);

  if (!dayEntries.length && !weekEntries.length) {
    console.error('❌ No data found.'); process.exit(1);
  }

  const existing = loadData();
  const slugs = Object.keys(TARGET_MODELS);

  for (const e of dayEntries) {
    if (!slugs.includes(e.slug)) continue;
    const date = e.date.substring(0, 10);
    if (!existing.daily[date]) existing.daily[date] = {};
    existing.daily[date][e.slug] = {
      tokens: e.prompt + e.completion,
      prompt: e.prompt, completion: e.completion,
      reasoning: e.reasoning, requests: e.count,
    };
  }

  for (const e of weekEntries) {
    if (!slugs.includes(e.slug)) continue;
    const date = e.date.substring(0, 10);
    if (!existing.weekly[date]) existing.weekly[date] = {};
    existing.weekly[date][e.slug] = {
      tokens: e.prompt + e.completion,
      prompt: e.prompt, completion: e.completion,
      reasoning: e.reasoning, requests: e.count,
    };
  }

  existing.lastUpdated = new Date().toISOString();
  saveData(existing);

  const latestDay = Object.keys(existing.daily).sort().pop();
  console.log(`\n📈 今日数据 (${latestDay || 'N/A'}):`);
  if (latestDay && existing.daily[latestDay]) {
    const rows = [];
    for (const [slug, d] of Object.entries(existing.daily[latestDay])) {
      const c = TARGET_MODELS[slug];
      if (c) rows.push({ name: c.name, tokens: d.tokens, requests: d.requests });
    }
    rows.sort((a, b) => b.tokens - a.tokens);
    for (const r of rows) {
      console.log(`   ${r.name.padEnd(14)} ${fmt(r.tokens).padStart(8)} tokens  ${fmt(r.requests)} requests`);
    }
  }

  generateDashboard(existing);
  console.log(`\n🎨 Dashboard → ${HTML_FILE}`);
}

if (require.main === module) main().catch(e => { console.error('Fatal:', e); process.exit(1); });
