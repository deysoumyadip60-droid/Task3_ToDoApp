const $ = s => document.querySelector(s);
const KEY = 'questlist_v2';
const XP = { high: 30, medium: 20, low: 10 };
const RANKS = ['Rookie', 'Apprentice', 'Warrior', 'Champion', 'Legend', 'Mythic'];
const need = l => 100 + (l - 1) * 50;

let S = { tasks: [], xp: 0, streak: 0, lastDay: '', theme: 'neon' };
let filter = 'active', query = '', dragId = null, undoTimer = null;

/* ---------- helpers ---------- */
const esc = t => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };
const dayStr = (off = 0) => {
    const d = new Date(); d.setDate(d.getDate() + off);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function level(xp) {
    let l = 1;
    while (xp >= need(l)) { xp -= need(l); l++; }
    return { l, cur: xp, max: need(l) };
}

/* ---------- storage (old 'tasks' data auto-migrates) ---------- */
function load() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        if (saved) S = { ...S, ...saved };
        else {
            const old = JSON.parse(localStorage.getItem('tasks'));
            if (old) {
                const m = (arr, done) => (arr || []).map(t => ({
                    id: t.id, text: t.text, p: t.priority || 'medium', due: t.dueDate || '',
                    done, rewarded: true
                }));
                S.tasks = [...m(old.pending, false), ...m(old.completed, true)];
            }
        }
    } catch (e) { /* fresh start */ }
}
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

/* ---------- confetti ---------- */
const cv = $('#fx'), cx = cv.getContext('2d');
let P = [], running = false;
const fit = () => { cv.width = innerWidth; cv.height = innerHeight; };
fit(); addEventListener('resize', fit);

function boom(x, y, n = 90) {
    const cols = ['#ff3d81', '#00e5ff', '#ffd24a', '#7cff6b', '#9b6bff'];
    for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, v = 3 + Math.random() * 8;
        P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5, s: 5 + Math.random() * 6,
                 c: cols[i % 5], r: Math.random() * 6, l: 80 + Math.random() * 50 });
    }
    if (!running) { running = true; loop(); }
}
function loop() {
    cx.clearRect(0, 0, cv.width, cv.height);
    P = P.filter(p => p.l-- > 0);
    P.forEach(p => {
        p.vy += 0.2; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.r += 0.25;
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r);
        cx.globalAlpha = Math.min(1, p.l / 30); cx.fillStyle = p.c;
        cx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); cx.restore();
    });
    if (P.length) requestAnimationFrame(loop);
    else { running = false; cx.clearRect(0, 0, cv.width, cv.height); }
}

/* ---------- toast ---------- */
function toast(msg, undoFn) {
    const t = $('#toast');
    t.innerHTML = `<span>${msg}</span>${undoFn ? '<button>Undo</button>' : ''}`;
    t.classList.add('show');
    if (undoFn) t.querySelector('button').onclick = () => { undoFn(); t.classList.remove('show'); };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => t.classList.remove('show'), 4500);
}

/* ---------- theme + greeting ---------- */
function setTheme(t) {
    S.theme = t;
    document.documentElement.dataset.theme = t;
    document.querySelectorAll('#themes button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    save();
}
$('#themes').onclick = e => { if (e.target.dataset.t) setTheme(e.target.dataset.t); };

function greet() {
    const h = new Date().getHours();
    const g = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    $('#greeting').textContent = `${g}. Finish quests, earn XP, keep your streak alive.`;
}

/* ---------- add ---------- */
$('#addForm').onsubmit = e => {
    e.preventDefault();
    const text = $('#taskInput').value.trim();
    if (!text) { $('#taskInput').focus(); toast('Type a quest name first'); return; }
    S.tasks.unshift({
        id: Date.now(), text, p: $('#prioritySelect').value,
        due: $('#dueDateInput').value, done: false, rewarded: false
    });
    $('#taskInput').value = ''; $('#dueDateInput').value = '';
    if (filter === 'done') setFilter('active');
    save(); render();
};

/* ---------- complete / edit / delete ---------- */
function complete(t, x, y) {
    t.done = !t.done;
    if (t.done) {
        boom(x, y);
        if (!t.rewarded) {
            t.rewarded = true;
            const before = level(S.xp).l;
            S.xp += XP[t.p];
            if (S.lastDay !== dayStr()) {
                S.streak = S.lastDay === dayStr(-1) ? S.streak + 1 : 1;
                S.lastDay = dayStr();
            }
            const after = level(S.xp).l;
            if (after > before) {
                toast(`🎉 Level up! You are now level ${after}`);
                setTimeout(() => boom(innerWidth / 2, innerHeight / 3, 200), 200);
            } else toast(`+${XP[t.p]} XP`);
        }
    }
}

function edit(li, t) {
    const sp = li.querySelector('.txt');
    sp.contentEditable = true; sp.focus();
    getSelection().selectAllChildren(sp);
    sp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); sp.blur(); } };
    sp.onblur = () => { t.text = sp.textContent.trim() || t.text; save(); render(); };
}

function remove(t) {
    const i = S.tasks.indexOf(t);
    S.tasks.splice(i, 1);
    save(); render();
    toast('Quest deleted', () => { S.tasks.splice(i, 0, t); save(); render(); });
}

$('#list').onclick = e => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    const t = S.tasks.find(x => x.id === +li.dataset.id);
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'check') { complete(t, e.clientX, e.clientY); save(); render(); }
    else if (a === 'edit') edit(li, t);
    else if (a === 'del') remove(t);
};

/* ---------- drag & drop reorder ---------- */
const L = $('#list');
L.addEventListener('dragstart', e => { const li = e.target.closest('li'); if (li) { dragId = +li.dataset.id; li.classList.add('drag'); } });
L.addEventListener('dragend', () => { dragId = null; render(); });
L.addEventListener('dragover', e => { e.preventDefault(); e.target.closest('li')?.classList.add('over-drop'); });
L.addEventListener('dragleave', e => e.target.closest('li')?.classList.remove('over-drop'));
L.addEventListener('drop', e => {
    e.preventDefault();
    const li = e.target.closest('li'); if (!li || dragId === null) return;
    const from = S.tasks.findIndex(t => t.id === dragId);
    const to = S.tasks.findIndex(t => t.id === +li.dataset.id);
    if (from < 0 || to < 0 || from === to) return;
    S.tasks.splice(to, 0, S.tasks.splice(from, 1)[0]);
    save();
});

/* ---------- filters, search, footer ---------- */
function setFilter(f) {
    filter = f;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.f === f));
    render();
}
$('#tabs').onclick = e => { if (e.target.dataset.f) setFilter(e.target.dataset.f); };
$('#search').oninput = e => { query = e.target.value.toLowerCase(); render(); };

$('#clearDone').onclick = () => {
    const gone = S.tasks.filter(t => t.done);
    if (!gone.length) return toast('Nothing to clear yet');
    S.tasks = S.tasks.filter(t => !t.done);
    save(); render();
    toast(`${gone.length} completed quests cleared`, () => { S.tasks.push(...gone); save(); render(); });
};
$('#exportBtn').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
    a.download = 'questlist-backup.json'; a.click();
};

addEventListener('keydown', e => {
    if (e.key === '/' && !/INPUT|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
        e.preventDefault(); $('#taskInput').focus();
    }
});

/* ---------- render ---------- */
function stats() {
    const lv = level(S.xp);
    $('#lvl').textContent = lv.l;
    $('#rank').textContent = `Level ${lv.l} ${RANKS[Math.min(lv.l - 1, RANKS.length - 1)]}`;
    $('#xpTxt').textContent = `${lv.cur} / ${lv.max} XP`;
    $('#xpFill').style.width = (lv.cur / lv.max * 100) + '%';
    $('#ringFg').style.strokeDashoffset = 213.6 * (1 - lv.cur / lv.max);
    const done = S.tasks.filter(t => t.done).length, total = S.tasks.length;
    $('#sDone').textContent = done;
    $('#sActive').textContent = total - done;
    $('#sRate').textContent = (total ? Math.round(done / total * 100) : 0) + '%';
    const alive = S.lastDay === dayStr() || S.lastDay === dayStr(-1);
    $('#streak').textContent = alive ? S.streak : 0;
}

const EMPTY = {
    active: '✨ No active quests. Add one above to start earning XP.',
    done: '🏆 Nothing completed yet. Finish a quest to see it here.',
    all: '🌱 Your list is empty. Add your first quest.'
};
const PL = { high: 'High', medium: 'Medium', low: 'Low' };

function render() {
    const today = dayStr();
    const items = S.tasks.filter(t =>
        (filter === 'all' || (filter === 'done') === t.done) &&
        t.text.toLowerCase().includes(query));

    $('#list').innerHTML = items.length ? items.map(t => {
        const over = t.due && !t.done && t.due < today;
        const due = t.due
            ? `<span class="tag ${over ? 'bad' : t.due === today ? 'warn' : ''}">📅 ${over ? 'Overdue · ' : t.due === today ? 'Due today · ' : ''}${new Date(t.due + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>`
            : '';
        return `<li class="task p-${t.p}${t.done ? ' done' : ''}" data-id="${t.id}" draggable="true">
            <button class="chk" data-a="check" aria-label="Toggle done">✓</button>
            <div class="body">
                <span class="txt">${esc(t.text)}</span>
                <div class="meta"><span class="tag pri">${PL[t.p]} · ${XP[t.p]} XP</span>${due}</div>
            </div>
            <div class="acts">
                <button data-a="edit" title="Edit">✎</button>
                <button data-a="del" title="Delete">🗑</button>
            </div>
        </li>`;
    }).join('') : `<li class="empty">${query ? '🔍 No quests match your search.' : EMPTY[filter]}</li>`;

    stats();
}

/* ---------- init ---------- */
load(); setTheme(S.theme); greet(); render();