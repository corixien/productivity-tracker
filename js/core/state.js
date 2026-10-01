// Shared app state plus a tiny event bus: modules render from `state` and re-render on events.
const bus = new EventTarget();

const state = {
    user: null,
    meta: null,
    tasks: [],
    tasksLoaded: false,
    tasksError: false,
    stats: null,
    templates: [],
    pendingSync: new Set()
};

function emit(name, detail) {
    bus.dispatchEvent(new CustomEvent(name, { detail }));
}

function on(name, handler) {
    const listener = (event) => handler(event.detail);
    bus.addEventListener(name, listener);
    return () => bus.removeEventListener(name, listener);
}

function setUser(user) {
    state.user = user;
    emit('user', user);
}

export { state, emit, on, setUser };
