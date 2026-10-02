// Live channel (server-sent events over fetch, so the Authorization header can be used).
// Delivers `sync` / `revoked` for the signed-in user and `log` / `db` for admins as `live:<type>` bus events.
// The stream is only open while the tab is visible, which also lets a sleeping free-tier server rest.
import { getAuthToken } from './api.js';
import { emit } from './state.js';

let controller = null;
let wanted = false;
let backoff = 1000;
let retryTimer = null;
let listening = false;

function dispatch(block) {
    let type = 'message';
    let data = '';
    for (const line of block.split('\n')) {
        if (line.startsWith('event:')) type = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) return;
    try { emit(`live:${type}`, JSON.parse(data)); } catch (error) { /* ignore malformed frames */ }
}

async function connect() {
    if (!wanted || controller || document.visibilityState === 'hidden') return;
    const token = getAuthToken();
    if (!token) return;
    controller = new AbortController();
    const mine = controller;
    try {
        const response = await fetch('/api/events', { headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' }, signal: mine.signal });
        if (response.status === 401) { wanted = false; return; }
        if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);
        backoff = 1000;
        emit('live:open', {});
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let end;
            while ((end = buffer.indexOf('\n\n')) !== -1) {
                dispatch(buffer.slice(0, end));
                buffer = buffer.slice(end + 2);
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') return;
    } finally {
        if (controller === mine) controller = null;
    }
    if (wanted && document.visibilityState === 'visible') {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
    }
}

function startLive() {
    wanted = true;
    if (!listening) {
        listening = true;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                if (controller) controller.abort();
                controller = null;
            } else if (wanted) {
                connect().then(() => null);
                emit('live:resume', {});
            }
        });
    }
    connect();
}

function stopLive() {
    wanted = false;
    clearTimeout(retryTimer);
    if (controller) controller.abort();
    controller = null;
}

export { startLive, stopLive };
