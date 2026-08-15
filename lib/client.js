window.__ModuleLoader__.load({ id: "@local/llm-ratelimit", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
// src/client/index.js
const TAG = '[llm-ratelimit]';

let React = null;
try { React = require('react'); } catch (e) { React = null; }

// ---------------- 浮层开关 store ----------------
let isOpen = false;
const openListeners = new Set();
const store = {
  isOpen: () => isOpen,
  open: () => { isOpen = true; openListeners.forEach(l => l()); },
  close: () => { isOpen = false; openListeners.forEach(l => l()); },
  subscribe: (l) => { openListeners.add(l); return () => openListeners.delete(l); }
};

// ---------------- 侧栏按钮（DOM 克隆） ----------------
let obs = null;
let installTimer = 0;

function findNewSessionButton() {
  if (typeof document === 'undefined') return null;
  const nodes = document.querySelectorAll('button[class*="newSession"]');
  for (let i = 0; i < nodes.length; i++) {
    if (String(nodes[i].className).indexOf('newSessionLabel') === -1) return nodes[i];
  }
  return null;
}

function installSidebarButton() {
  if (typeof document === 'undefined') return;
  const target = findNewSessionButton();
  if (!target || !target.parentElement) return;
  if (target.parentElement.querySelector('.dsws-sidebar-entry')) return;

  const btn = target.cloneNode(true);
  btn.className = String(target.className) + ' dsws-sidebar-entry';
  btn.setAttribute('aria-label', '限流控制');
  btn.innerHTML = '';
  const icon = document.createElement('span');
  icon.className = 'dsws-sidebar-icon';
  icon.textContent = '⏱️';
  btn.appendChild(icon);
  const label = document.createElement('span');
  label.className = 'dsws-sidebar-label';
  label.textContent = '限流控制';
  btn.appendChild(label);
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    store.open();
  });
  target.insertAdjacentElement('afterend', btn);
  console.log(TAG, '侧栏按钮已安装');
}

function watchSidebar() {
  if (typeof document === 'undefined' || obs) return;
  obs = new MutationObserver(() => {
    window.clearTimeout(installTimer);
    installTimer = window.setTimeout(installSidebarButton, 300);
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

function removeSidebarButton() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.dsws-sidebar-entry').forEach(el => el.remove());
}

// ---------------- 样式 ----------------
const CSS = `
.dshws-root{display:flex;flex-direction:column;font-size:13px;line-height:1.5;color:inherit;min-height:0;}
.dshws-overlay{position:fixed;top:20px;right:20px;bottom:20px;width:min(760px,calc(100vw - 40px));background:#fff;border:1px solid rgba(127,127,127,.35);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25);z-index:1000;pointer-events:auto;overflow:hidden;color:#1f2328;}
@media (prefers-color-scheme: dark){.dshws-overlay{background:#16181d;color:#e6e6e6;}}
.dshws-header{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid rgba(127,127,127,.25);flex:0 0 auto;}
.dshws-title{font-weight:600;font-size:14px;white-space:nowrap;}
.dshws-close{border:none;background:transparent;cursor:pointer;font-size:13px;color:inherit;opacity:.7;padding:4px 8px;border-radius:6px;}
.dshws-close:hover{opacity:1;background:rgba(127,127,127,.15);}
.dshws-body{padding:14px;overflow-y:auto;flex:1;}
.dshws-status{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0;}
.dshws-status-item{background:rgba(127,127,127,.08);border-radius:8px;padding:10px;}
.dshws-label{font-size:11px;opacity:.7;}
.dshws-value{font-size:20px;font-weight:600;}
.dshws-btn{padding:6px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;cursor:pointer;margin-right:8px;}
.dshws-btn-primary{background:#2d6cdf;color:#fff;border-color:#2d6cdf;}
.dshws-input{width:80px;padding:4px 8px;border-radius:4px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;}
.dsws-sidebar-icon{font-size:15px;line-height:1;display:inline-flex;align-items:center;}
div[class*="_collapsed"] .dsws-sidebar-label{display:none;}
`;

function injectStyles() {
  if (typeof document === 'undefined') return;
  const tagId = '@local/llm-ratelimit/styles';
  if (document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']')) return;
  const tag = document.createElement('style');
  tag.dataset.plugin = '@local/llm-ratelimit';
  tag.dataset.pluginCss = tagId;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

// ---------------- React 组件 ----------------
if (React !== null) {
  function el(type, props, ...children) {
    return React.createElement.apply(null, [type, props || {}].concat(children));
  }

  function useOpen() {
    const [snap, setSnap] = React.useState(store.isOpen());
    React.useEffect(() => store.subscribe(() => setSnap(store.isOpen())), []);
    return snap;
  }

  function RateLimitOverlay() {
    const open = useOpen();
    const [status, setStatus] = React.useState({ enabled: true, maxPerMinute: 10, inWindow: 0, remaining: 10 });
    const [limitInput, setLimitInput] = React.useState(10);

    const fetchStatus = async () => {
      try {
        const res = await fetch('/llm-ratelimit/status');
        const data = await res.json();
        setStatus(data);
      } catch (e) {}
    };

    React.useEffect(() => {
      if (open) {
        fetchStatus();
        const interval = setInterval(fetchStatus, 2000);
        return () => clearInterval(interval);
      }
    }, [open]);

    const handleToggle = async () => {
      await fetch('/llm-ratelimit/toggle', { method: 'POST' });
      fetchStatus();
    };

    const handleSetLimit = async () => {
      await fetch('/llm-ratelimit/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxPerMinute: limitInput })
      });
      fetchStatus();
    };

    const handleReset = async () => {
      await fetch('/llm-ratelimit/reset', { method: 'POST' });
      fetchStatus();
    };

    if (!open) return null;

    return el('div', { className: 'dshws-overlay' },
      el('div', { className: 'dshws-header' },
        el('span', { className: 'dshws-title' }, '⏱️ LLM 速率限制'),
        el('button', { className: 'dshws-close', onClick: store.close }, '✕')
      ),
      el('div', { className: 'dshws-body' },
        el('div', null,
          el('button', { className: 'dshws-btn dshws-btn-primary', onClick: handleToggle },
            status.enabled ? '禁用限流' : '启用限流'
          ),
          el('button', { className: 'dshws-btn', onClick: handleReset }, '重置计数')
        ),
        el('div', { className: 'dshws-status' },
          el('div', { className: 'dshws-status-item' },
            el('div', { className: 'dshws-label' }, '状态'),
            el('div', { className: 'dshws-value' }, status.enabled ? '✅ 启用' : '❌ 禁用')
          ),
          el('div', { className: 'dshws-status-item' },
            el('div', { className: 'dshws-label' }, '窗口内请求'),
            el('div', { className: 'dshws-value' }, status.inWindow)
          ),
          el('div', { className: 'dshws-status-item' },
            el('div', { className: 'dshws-label' }, '配额上限'),
            el('div', { className: 'dshws-value' }, status.maxPerMinute)
          ),
          el('div', { className: 'dshws-status-item' },
            el('div', { className: 'dshws-label' }, '剩余配额'),
            el('div', { className: 'dshws-value' }, status.remaining)
          )
        ),
        el('div', null,
          el('label', null, '每分钟最大请求数：'),
          el('input', {
            type: 'number',
            className: 'dshws-input',
            value: limitInput,
            onChange: (e) => setLimitInput(parseInt(e.target.value) || 1),
            min: 1
          }),
          el('button', { className: 'dshws-btn', onClick: handleSetLimit }, '设置')
        )
      )
    );
  }

  var WorkshopComponent = RateLimitOverlay;
  var hasReact = true;
} else {
  var WorkshopComponent = null;
  var hasReact = false;
}

// ---------------- 插件入口 ----------------
function apply(ctx) {
  console.log(TAG, 'apply, React =', hasReact);
  const slots = ctx.get('slots');
  if (slots !== undefined && WorkshopComponent !== null) {
    slots.inject('shell.overlay', function () {
      return slots.register(
        { name: 'shell.overlay', id: 'llm-ratelimit-overlay', order: 50, label: '限流控制' },
        function () { return React.createElement(WorkshopComponent, { variant: 'overlay' }); }
      );
    });
    slots.inject('settings.plugins.tab', function () {
      return slots.register(
        { name: 'settings.plugins.tab', id: 'llm-ratelimit-settings', order: 20, label: '限流控制' },
        function () { return React.createElement(WorkshopComponent, { variant: 'tab' }); }
      );
    });
  }
  if (typeof document !== 'undefined') {
    injectStyles();
    installSidebarButton();
    watchSidebar();
    ctx.effect(function () {
      return function () {
        if (obs) { obs.disconnect(); obs = null; }
        window.clearTimeout(installTimer);
        removeSidebarButton();
        const s = document.querySelector('style[data-plugin="@local/llm-ratelimit"]');
        if (s) s.remove();
      };
    }, 'llm-ratelimit: 侧栏入口清理');
  }
}

module.exports = { apply };
return module.exports;
} });
