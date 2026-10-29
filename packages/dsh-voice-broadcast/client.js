window.__ModuleLoader__.load({
  id: '@bopii6/dsh-voice-broadcast',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect } = React;
    const useSyncExternalStore = React.useSyncExternalStore;

    const NS = 'voice-broadcast';
    const STORAGE_KEY = 'dsh.voice-broadcast.enabled';

    /* ------------------------------------------------------------------ text */

    const DICT_ZH = {
      'action.enable': '开启语音播报',
      'action.disable': '关闭语音播报',
      'action.unavailable': '当前环境不支持语音播报',
    };

    const DICT_EN = {
      'action.enable': 'Turn on voice narration',
      'action.disable': 'Turn off voice narration',
      'action.unavailable': 'Voice narration is unavailable in this environment',
    };

    const FILLER = /^(好的|好|嗯|行|可以|收到|OK|Okay)[，,、~～!！\s]*/i;

    /** Flatten one Markdown slice into speakable plain text. */
    function cleanInline(raw) {
      let text = String(raw == null ? '' : raw);
      text = text.replace(/```[\s\S]*?```/g, ' ');
      text = text.replace(/~~~[\s\S]*?~~~/g, ' ');
      text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
      text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
      text = text.replace(/`([^`]*)`/g, '$1');
      text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
      text = text.replace(/^\s{0,3}>\s?/gm, '');
      text = text.replace(/^\s*[-*+]\s+/gm, '');
      text = text.replace(/^\s*\d+[.)]\s+/gm, '');
      text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
      text = text.replace(/__([^_]+)__/g, '$1');
      text = text.replace(/~~([^~]+)~~/g, '$1');
      text = text.replace(/[*_]{1,2}/g, '');
      text = text.replace(/^\s*\|.*\|\s*$/gm, ' ');
      text = text.replace(/^\s*[-:]{3,}\s*$/gm, ' ');
      text = text.replace(/[ \t]+/g, ' ');
      text = text.replace(/\s*\n\s*/g, '\n');
      text = text.replace(/\n+/g, '。');
      text = text.replace(/。{2,}/g, '。');
      return text.trim();
    }

    /**
     * The first one or two sentences, capped at `budget` characters. Long model
     * answers are exactly what must not be read aloud in full.
     */
    function takeSentence(raw, budget) {
      const text = cleanInline(raw)
        .replace(FILLER, '')
        .replace(/^(完成|总结|小结|Done)\s*[。：:，,]\s*/i, '');
      if (!text) return '';
      const sentences = text.split(/(?<=[。！？!?；;…])/u).map((part) => part.trim()).filter(Boolean);
      let out = '';
      for (const sentence of sentences) {
        if (out && out.length + sentence.length > budget) break;
        out += sentence;
        if (out.length >= budget * 0.62) break;
      }
      if (!out) out = text.slice(0, budget);
      return out.length > budget ? out.slice(0, budget) + '…' : out;
    }

    /* ----------------------------------------------------------------- steps */

    const CJK = /[\u3400-\u9fff]/;

    function readArgs(raw) {
      if (!raw) return null;
      try {
        const value = JSON.parse(raw);
        return value && typeof value === 'object' ? value : null;
      } catch (error) {
        return null;
      }
    }

    function shortText(value, max) {
      if (typeof value !== 'string') return '';
      const text = value.replace(/\s+/g, ' ').trim();
      if (!text) return '';
      return text.length > max ? text.slice(0, max - 1) + '…' : text;
    }

    function shortPath(value) {
      if (typeof value !== 'string' || !value.trim()) return '';
      const parts = value.replace(/\\/g, '/').split('/').filter(Boolean);
      const base = parts.pop();
      if (!base) return '';
      return base.length > 22 ? base.slice(0, 20) + '…' : base;
    }

    function commandTarget(args) {
      const command = args && typeof args.command === 'string' ? args.command.trim() : '';
      const token = command.split(/\s+/)[0];
      if (!token) return '';
      const base = token.replace(/\\/g, '/').split('/').pop() || '';
      return base.replace(/\.exe$/i, '');
    }

    function webTarget(args) {
      const url = args && typeof args.url === 'string' ? args.url : '';
      if (!url) return '';
      try {
        return new URL(url).host.replace(/^www\./, '');
      } catch (error) {
        return '';
      }
    }

    /** Drop a short technical extension so "client.js" is spoken as "client". */
    function fileLabel(value) {
      const base = shortPath(value);
      if (!base) return '';
      const dot = base.lastIndexOf('.');
      if (dot <= 0) return base;
      if (!/^[a-z0-9]{1,4}$/i.test(base.slice(dot + 1))) return base;
      return base.slice(0, dot);
    }

    /**
     * One spoken sentence per Tool call, phrased the way a person narrates their
     * own work ("我来看一下 client 这个文件"), never as a status field
     * ("正在读 client.js"). Every line carries the concrete object.
     */
    function stepPhrase(name, argsRaw) {
      const args = readArgs(argsRaw);
      switch (name) {
        case 'read': {
          const file = fileLabel(args && (args.file_path || args.path));
          return file ? '我来看一下 ' + file + ' 这个文件。' : '我来看一下这个文件。';
        }
        case 'read_image': {
          const file = fileLabel(args && (args.file_path || args.path));
          return file ? '我来看一下 ' + file + ' 这张图。' : '我来看一下这张图。';
        }
        case 'edit':
        case 'str_replace_editor': {
          const file = fileLabel(args && args.file_path);
          return file ? '我来改一下 ' + file + '。' : '我来改一下代码。';
        }
        case 'write': {
          const file = fileLabel(args && args.file_path);
          return file ? '我来写 ' + file + ' 这个文件。' : '我来写个文件。';
        }
        case 'grep': {
          const pattern = shortText(args && args.pattern, 16);
          const where = fileLabel(args && args.path);
          if (!pattern) return where ? '我在 ' + where + ' 里找找看。' : '我搜一下代码。';
          return where ? '我在 ' + where + ' 里搜一下 ' + pattern + '。' : '我搜一下 ' + pattern + '。';
        }
        case 'glob': {
          const pattern = shortText(args && args.pattern, 20).replace(/[{}*]/g, '').replace(/^\/+/, '');
          return pattern ? '我找一下 ' + pattern + ' 这类文件。' : '我找一下相关文件。';
        }
        case 'pwsh':
        case 'bash': {
          const described = shortText(args && (args.description || args.justification), 32);
          if (described && CJK.test(described)) {
            return (/^(我|先|再|接着)/.test(described) ? described : '我来' + described) + '。';
          }
          const target = commandTarget(args);
          return target ? '我跑一下 ' + target + '。' : '我跑一条命令。';
        }
        case 'web_search': {
          const query = args && Array.isArray(args.queries) ? shortText(args.queries[0], 24) : '';
          return query ? '我查一下 ' + query + '。' : '我上网查一下。';
        }
        case 'web_fetch': {
          const host = webTarget(args);
          return host ? '我打开 ' + host + ' 看看。' : '我打开一个网页看看。';
        }
        case 'subagent':
        case 'subagent_fork': {
          const brief = shortText(args && args.description, 24);
          return brief && CJK.test(brief) ? '我派一个子任务：' + brief + '。' : '我派一个子任务去做。';
        }
        case 'skill': {
          const skillName = shortText(args && args.name, 20);
          return skillName ? '我先把 ' + skillName + ' 这个技能加载进来。' : '我先加载一个技能。';
        }
        case 'present': {
          const count = args && Array.isArray(args.files) ? args.files.length : 0;
          return count ? '我把 ' + count + ' 个文件整理成交付物。' : '我整理一下交付物。';
        }
        case 'create_goal': {
          const goal = shortText(args && args.objective, 28);
          return goal ? '我把目标定成：' + goal + '。' : '我设一个目标。';
        }
        case 'update_goal': {
          const goal = shortText(args && args.objective, 28);
          return goal ? '我调整一下目标：' + goal + '。' : '我更新一下目标。';
        }
        case 'schedule_create': {
          const title = shortText(args && args.title, 24);
          return title ? '我设个提醒：' + title + '。' : '我设一个提醒。';
        }
        case 'job_output':
        case 'job_list':
          return '我看一下后台任务的结果。';
        case 'job_kill':
          return '我把一个后台任务停掉。';
        case 'interrupt_agent':
          return '我叫停一个子代理。';
        case 'send_message':
          return '我给子代理发条消息。';
        case 'terminal_open':
          return '我打开终端。';
        case 'terminal_read':
          return '我看一下终端输出。';
        default:
          return '';
      }
    }

    /* ---------------------------------------------------------------- engine */

    /**
     * Owns playback, the step decision rules, and the retained session. It is
     * created once per plugin activation and outlives the toggle's mount, so
     * narration keeps running while the conversation is scrolled away or the
     * user opens another panel.
     */
    function createNarrator(ctx) {
      const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
      const listeners = new Set();

      let enabled = false;
      try {
        enabled = window.localStorage.getItem(STORAGE_KEY) === '1';
      } catch (error) {
        enabled = false;
      }

      let voice = null;
      let reference = null;
      let unsubscribe = null;
      let currentId = '';
      let desiredId = '';
      let watermark = -1;
      let stepNarrated = false;
      let lastText = '';
      let lastTodo = '';
      let pending = [];
      let timer = null;
      let lastKey = '';
      let lastAt = 0;
      let current = null;
      let queued = null;
      let disposed = false;

      const emit = () => {
        for (const listener of listeners) {
          try {
            listener();
          } catch (error) {
            console.warn('[voice-broadcast] listener', error);
          }
        }
      };

      function refreshVoice() {
        if (!synth) return;
        let list = [];
        try {
          list = synth.getVoices() || [];
        } catch (error) {
          list = [];
        }
        if (!list.length) return;
        const chinese = list.filter((item) => /^zh/i.test(item.lang || '') || /chinese|中文|普通话/i.test(item.name || ''));
        voice = chinese.find((item) => /xiaoxiao|natural|neural|online/i.test(item.name || '')) || chinese[0] || null;
        emit();
      }

      if (synth) {
        refreshVoice();
        try {
          synth.addEventListener('voiceschanged', refreshVoice);
        } catch (error) {
          synth.onvoiceschanged = refreshVoice;
        }
      }

      function speakRaw(text) {
        if (!synth || disposed) return;
        let utterance;
        try {
          utterance = new SpeechSynthesisUtterance(text);
        } catch (error) {
          return;
        }
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        } else {
          utterance.lang = 'zh-CN';
        }
        utterance.rate = 1;
        utterance.pitch = 1;
        const token = { utterance };
        current = token;
        const finished = () => {
          if (current !== token) return;
          current = null;
          drain();
        };
        utterance.onend = finished;
        utterance.onerror = finished;
        try {
          synth.speak(utterance);
        } catch (error) {
          console.warn('[voice-broadcast] speak failed', error);
          finished();
        }
      }

      function drain() {
        if (!enabled || disposed || current) return;
        if (!queued) return;
        const text = queued;
        queued = null;
        speakRaw(text);
      }

      /**
       * Speaking never chops a sentence in half: a normal line waits for the
       * current one to finish (only the newest waits, so playback stays current),
       * while urgent lines interrupt.
       */
      function speak(text, urgent) {
        if (!synth || !text) return;
        if (urgent) {
          queued = null;
          current = null;
          try {
            synth.cancel();
          } catch (error) {
            /* ignore */
          }
          setTimeout(() => {
            if (!disposed) speakRaw(text);
          }, 70);
          return;
        }
        if (current || synth.speaking) {
          queued = text;
          return;
        }
        speakRaw(text);
      }

      function say(text, urgent) {
        if (!enabled || disposed) return;
        const clean = String(text == null ? '' : text).trim();
        if (!clean) return;
        const now = Date.now();
        if (clean === lastKey && now - lastAt < 5000) return;
        lastKey = clean;
        lastAt = now;
        speak(clean, urgent === true);
      }

      /** Coalesce bursts of tool calls into one line, then speak the latest. */
      function queueStep(text) {
        pending.push(text);
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, 900);
      }

      function flush() {
        timer = null;
        if (!pending.length) return;
        const items = pending;
        pending = [];
        const unique = [];
        for (const item of items) {
          if (unique[unique.length - 1] !== item) unique.push(item);
        }
        let line;
        if (unique.length === 1) line = unique[0];
        else if (unique.length === 2) line = unique[0] + '，' + unique[1];
        else line = unique[0] + '，另外还有 ' + (unique.length - 1) + ' 个操作';
        say(line, false);
      }

      /** Step-level line: supersedes queued step chatter, never chops a sentence. */
      function sayLatest(text) {
        pending = [];
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        say(text, false);
      }

      /** Urgent line: the listener must hear it now, even mid-sentence. */
      function sayNow(text) {
        pending = [];
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        say(text, true);
      }

      function onTodo(argsRaw) {
        let args;
        try {
          args = JSON.parse(argsRaw || '{}');
        } catch (error) {
          return;
        }
        const todos = Array.isArray(args && args.todos) ? args.todos : [];
        const active = todos.find((item) => item && ['in_progress', 'doing', 'active', 'running'].includes(item.status))
          || todos.find((item) => item && item.active === true);
        if (!active) return;
        const content = cleanInline(active.content || active.title || '');
        if (!content || content === lastTodo) return;
        lastTodo = content;
        sayLatest('接下来做：' + (content.length > 34 ? content.slice(0, 32) + '…' : content) + '。');
      }

      function onEvent(event) {
        const data = event.data || {};
        switch (event.type) {
          case 'turn/start':
            stepNarrated = false;
            lastText = '';
            break;

          case 'step/start':
            stepNarrated = false;
            break;

          case 'assistant/message': {
            if (data.interrupted) break;
            const message = data.message || {};
            const blocks = Array.isArray(message.content) ? message.content : [];
            const text = blocks.filter((block) => block && block.type === 'text').map((block) => block.text || '').join('\n');
            const hasToolCall = blocks.some((block) => block && block.type === 'tool-call');
            if (hasToolCall) {
              const line = takeSentence(text, 46);
              // "好的，我来看看。" says nothing; let the tool phrase carry the detail.
              if (line.length >= 8) {
                stepNarrated = true;
                sayLatest(line);
              }
            } else if (text.trim()) {
              lastText = text;
            }
            break;
          }

          case 'tool/call': {
            const name = String(data.name || '');
            if (name === 'ask_user_question') {
              const asked = readArgs(data.arguments);
              const first = asked && Array.isArray(asked.questions) ? asked.questions[0] : null;
              const question = shortText(first && (first.question || first.header), 40);
              sayNow(question ? '需要你定一下：' + question + '。' : '需要你确认一下。');
              break;
            }
            if (name === 'todo_write') {
              onTodo(data.arguments);
              break;
            }
            if (stepNarrated) break;
            const phrase = stepPhrase(name, data.arguments);
            if (phrase) queueStep(phrase);
            break;
          }

          case 'tool/result': {
            const reason = data.error ? shortText(data.error.reason, 30) : '';
            if (reason) sayNow('报错了：' + reason);
            break;
          }

          case 'turn/end': {
            const kind = (data.reason && data.reason.kind) || 'completed';
            if (kind === 'completed') {
              const conclusion = takeSentence(lastText, 110);
              if (conclusion) sayNow(/^好/.test(conclusion) ? conclusion : '好了，' + conclusion);
            } else if (kind === 'aborted') {
              sayNow('已停止');
            } else if (kind === 'interrupted') {
              sayNow('已中断');
            }
            lastText = '';
            stepNarrated = false;
            break;
          }

          default:
            break;
        }
      }

      function baseline(snapshot) {
        watermark = -1;
        const entries = (snapshot && snapshot.entries) || [];
        for (const entry of entries) {
          if (!entry || entry.type !== 'event' || !entry.event) continue;
          if (typeof entry.event.seq === 'number' && entry.event.seq > watermark) watermark = entry.event.seq;
        }
      }

      function consume(entries) {
        if (!Array.isArray(entries)) return;
        for (const entry of entries) {
          if (!entry || entry.type !== 'event' || !entry.event) continue;
          const event = entry.event;
          if (typeof event.seq !== 'number' || event.seq <= watermark) continue;
          watermark = event.seq;
          try {
            onEvent(event);
          } catch (error) {
            console.warn('[voice-broadcast] narration', error);
          }
        }
      }

      function onWindow(snapshot) {
        if (!snapshot) return;
        const change = snapshot.change;
        if (!change) return;
        if (!enabled) return;
        if (change.kind === 'append') consume(change.entries);
        else if (change.kind === 'settle-assistant') {
          if (change.entry) consume([change.entry]);
        } else baseline(snapshot);
      }

      function release() {
        if (unsubscribe) {
          try {
            unsubscribe();
          } catch (error) {
            /* ignore */
          }
          unsubscribe = null;
        }
        if (reference) {
          try {
            reference.release();
          } catch (error) {
            /* ignore */
          }
          reference = null;
        }
        currentId = '';
        watermark = -1;
        stepNarrated = false;
        lastText = '';
      }

      function follow(sessionId) {
        desiredId = sessionId ? String(sessionId) : '';
        if (!enabled || disposed || !desiredId) return;
        if (reference && currentId === desiredId && unsubscribe) return;
        release();
        const sessions = ctx.sessions;
        if (!sessions || typeof sessions.retain !== 'function') return;
        currentId = desiredId;
        let ref;
        try {
          ref = sessions.retain(desiredId, { source: 'controllerOperation' });
        } catch (error) {
          console.warn('[voice-broadcast] cannot retain session', error);
          currentId = '';
          return;
        }
        reference = ref;
        Promise.resolve(ref.ready).then((binding) => {
          if (reference !== ref || !enabled || disposed) return;
          const source = binding && binding.eventSource;
          if (!source) return;
          baseline(source.getSnapshot());
          unsubscribe = source.subscribe(() => {
            if (reference !== ref) return;
            onWindow(source.getSnapshot());
          });
        }).catch((error) => {
          console.warn('[voice-broadcast] session did not open', error);
        });
      }

      function setEnabled(next) {
        enabled = Boolean(next);
        try {
          window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
        } catch (error) {
          /* ignore */
        }
        emit();
        if (!enabled) {
          pending = [];
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          try {
            if (synth) synth.cancel();
          } catch (error) {
            /* ignore */
          }
          release();
          return;
        }
        if (desiredId) follow(desiredId);
        sayNow('语音播报开了，我会说说我正在做什么。');
      }

      function dispose() {
        disposed = true;
        listeners.clear();
        release();
        try {
          if (synth) synth.cancel();
        } catch (error) {
          /* ignore */
        }
      }

      return {
        follow,
        setEnabled,
        dispose,
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        getEnabled() {
          return enabled;
        },
        available() {
          return Boolean(synth) && typeof SpeechSynthesisUtterance === 'function';
        },
        voiceName() {
          return voice ? voice.name : '';
        },
        debug: {
          speak: (text) => sayNow(text),
          state: () => ({
            enabled,
            sessionId: currentId,
            voice: voice ? voice.name : '',
            voices: synth ? synth.getVoices().length : 0,
            speaking: synth ? synth.speaking : false,
          }),
        },
      };
    }

    /* -------------------------------------------------------------------- ui */

    const CSS = [
      '.dvb-btn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background-color .15s ease,color .15s ease}',
      '.dvb-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dvb-btn[data-on="true"]{color:var(--dsw-alias-brand-primary)}',
      '.dvb-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dvb-btn:disabled{opacity:.45;cursor:default}',
    ].join('');

    function SpeakerIcon(props) {
      const on = props.on;
      return h('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': true,
        focusable: 'false',
      },
        h('path', {
          d: 'M9.1 2.35 5.6 5.05H3.6a1 1 0 0 0-1 1v3.9a1 1 0 0 0 1 1h2l3.5 2.7a.55.55 0 0 0 .9-.44V2.79a.55.55 0 0 0-.9-.44Z',
          fill: 'currentColor',
        }),
        on ? h('path', {
          d: 'M11.5 5.4a3.7 3.7 0 0 1 0 5.2',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
        }) : null,
        on ? h('path', {
          d: 'M13.3 3.6a6.4 6.4 0 0 1 0 8.8',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          opacity: 0.6,
        }) : null,
        on ? null : h('path', {
          d: 'M11.7 6.3 14.3 9.7M14.3 6.3 11.7 9.7',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
        })
      );
    }

    function createToggleComponent(t, narrator) {
      return function VoiceToggle(props) {
        const sessionId = props.sessionId;
        const enabled = useSyncExternalStore(narrator.subscribe, narrator.getEnabled, narrator.getEnabled);
        const available = narrator.available();
        const label = available
          ? (enabled ? t('action.disable') : t('action.enable'))
          : t('action.unavailable');
        const voiceName = narrator.voiceName();
        const title = voiceName ? label + ' · ' + voiceName : label;

        useEffect(() => {
          narrator.follow(sessionId);
        }, [sessionId]);

        return h(React.Fragment, null,
          h('style', null, CSS),
          h('button', {
            type: 'button',
            className: 'dvb-btn',
            'data-on': enabled ? 'true' : 'false',
            title: title,
            'aria-label': label,
            'aria-pressed': enabled,
            disabled: !available,
            onClick: () => narrator.setEnabled(!enabled),
          }, h(SpeakerIcon, { on: enabled }))
        );
      };
    }

    /* ----------------------------------------------------------------- mount */

    return {
      inject: ['slots', 'sessions', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, 'zh', DICT_ZH), 'voice-broadcast locale zh');
        ctx.effect(() => ctx.locale.register(NS, 'en', DICT_EN), 'voice-broadcast locale en');
        ctx.effect(() => ctx.locale.register(NS, 'zh-CN', DICT_ZH), 'voice-broadcast locale zh-CN');

        const narrator = createNarrator(ctx);
        ctx.effect(() => () => narrator.dispose(), 'voice-broadcast narrator');
        window.__dshVoiceBroadcast = narrator;

        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'voice-broadcast',
          order: 30,
          label: () => t('action.enable'),
        }, createToggleComponent(t, narrator)));
      },
    };
  },
});
