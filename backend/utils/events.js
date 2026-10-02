// In-process pub/sub for server-sent events. Single instance only (matches the Render deployment):
// users receive `sync`/`revoked` when something changed their data elsewhere, admins receive a live feed.
const MAX_CONNECTIONS_PER_USER = 5;
const KEEPALIVE_MS = 25000;

const userClients = new Map();   // userId -> Set<res>
const adminClients = new Set();  // res
let keepAliveTimer = null;

function write(res, type, data) {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
}

function startKeepAlive() {
    if (keepAliveTimer) return;
    keepAliveTimer = setInterval(() => {
        const all = new Set([...adminClients]);
        userClients.forEach((set) => set.forEach((res) => all.add(res)));
        all.forEach((res) => res.write(': keep-alive\n\n'));
        if (all.size === 0) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
    }, KEEPALIVE_MS);
    keepAliveTimer.unref();
}

function subscribe(req, res, user) {
    res.status(200).set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');

    const set = userClients.get(user.id) || new Set();
    if (set.size >= MAX_CONNECTIONS_PER_USER) set.values().next().value.end();
    set.add(res);
    userClients.set(user.id, set);
    if (user.isAdmin) adminClients.add(res);
    startKeepAlive();
    write(res, 'ready', { admin: Boolean(user.isAdmin) });

    req.on('close', () => {
        set.delete(res);
        if (set.size === 0) userClients.delete(user.id);
        adminClients.delete(res);
    });
}

function publishToUser(userId, type, data) {
    const set = userClients.get(userId);
    if (set) set.forEach((res) => write(res, type, data));
}

function publishAdmin(type, data) {
    adminClients.forEach((res) => write(res, type, data));
}

const stats = () => ({ users: userClients.size, admins: adminClients.size });

module.exports = { subscribe, publishToUser, publishAdmin, stats };
