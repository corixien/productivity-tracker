// Small dependency-free SVG charts (presentation attributes only: no inline styles, CSP safe).
const SVG_NS = 'http://www.w3.org/2000/svg';
let gradientCounter = 0;

function el(name, attributes = {}, ...children) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    node.append(...children);
    return node;
}

const W = 600;
const H = 220;
const PAD = { left: 44, right: 10, top: 14, bottom: 32 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

function frame(max, unit, points, labelEvery) {
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img' });
    [0, 0.5, 1].forEach((fraction) => {
        const y = PAD.top + plotH * (1 - fraction);
        svg.append(
            el('line', { x1: PAD.left, x2: W - PAD.right, y1: y, y2: y, class: 'chart-gridline' }),
            Object.assign(el('text', { x: PAD.left - 6, y: y + 4, class: 'chart-axis', 'text-anchor': 'end' }), { textContent: `${Math.round(max * fraction)}${unit}` })
        );
    });
    points.forEach((point, i) => {
        if (i % labelEvery !== 0 && i !== points.length - 1) return;
        const x = PAD.left + (plotW * (points.length === 1 ? 0.5 : i / (points.length - 1)));
        svg.append(Object.assign(el('text', { x, y: H - 9, class: 'chart-axis', 'text-anchor': 'middle' }), { textContent: point.label }));
    });
    return svg;
}

// Area/line chart, values 0..max.
function areaChart(points, { max = 100, unit = '%', label }) {
    const svg = frame(max, unit, points, 4);
    svg.setAttribute('aria-label', label);
    const id = `area-grad-${gradientCounter += 1}`;
    const x = (i) => PAD.left + plotW * (points.length === 1 ? 0.5 : i / (points.length - 1));
    const y = (value) => PAD.top + plotH * (1 - Math.min(value, max) / max);
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
    const area = `${line} L${x(points.length - 1).toFixed(1)} ${PAD.top + plotH} L${x(0).toFixed(1)} ${PAD.top + plotH} Z`;
    svg.prepend(el('defs', {}, el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 },
        el('stop', { offset: '0', class: 'chart-stop-top' }), el('stop', { offset: '1', class: 'chart-stop-bottom' }))));
    svg.append(el('path', { d: area, fill: `url(#${id})`, class: 'chart-area' }), el('path', { d: line, class: 'chart-line', fill: 'none' }));
    points.forEach((p, i) => {
        const hit = el('circle', { cx: x(i), cy: y(p.value), r: 5, class: 'chart-dot' });
        hit.append(el('title', {}, Object.assign(document.createTextNode(p.title))));
        svg.append(hit);
    });
    return svg;
}

// Bar chart; each point may carry `errors` drawn as a red part of the bar.
function barChart(points, { max, label }) {
    const top = Math.max(max || 0, ...points.map((p) => p.value), 1);
    const svg = frame(top, '', points, 4);
    svg.setAttribute('aria-label', label);
    const slot = plotW / points.length;
    const barW = Math.max(4, slot * 0.62);
    points.forEach((p, i) => {
        const x = PAD.left + slot * i + (slot - barW) / 2;
        const total = (p.value / top) * plotH;
        const errors = ((p.errors || 0) / top) * plotH;
        const group = el('g', { class: 'chart-bar-group' });
        group.append(
            el('rect', { x, y: PAD.top + plotH - Math.max(total, p.value > 0 ? 2 : 0), width: barW, height: Math.max(total, p.value > 0 ? 2 : 0), rx: 3, class: 'chart-bar' }),
            ...(errors > 0 ? [el('rect', { x, y: PAD.top + plotH - errors, width: barW, height: errors, rx: 3, class: 'chart-bar is-error' })] : []),
            el('rect', { x: PAD.left + slot * i, y: PAD.top, width: slot, height: plotH, class: 'chart-hit' }),
            el('title', {}, document.createTextNode(p.title))
        );
        svg.append(group);
    });
    return svg;
}

export { areaChart, barChart };
