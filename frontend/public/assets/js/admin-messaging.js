/* ═══════════════════════════════════════════════════════════
   ComboMaster Admin — Messaging subsystem
   Attachments · Emoji · Reactions · Reply · Typing · Sound
   Depends on: window.API.request (assets/js/api.js),
               window.Loader (assets/js/loader.js)
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.ComboMessaging) return;

  /* ────────────────────────────────────────────────
     STATE
     ──────────────────────────────────────────────── */
  const M = {
    activeUserId: null,
    messages: [],               // current thread
    pendingAttachment: null,    // { id, url, mime_type, original_name }
    replyTo: null,              // { id, body }
    soundEnabled: true,
    typingEnabled: true,
    reactionsEnabled: true,
    attachmentsEnabled: true,
    receiptsEnabled: true,
    typingPollTimer: null,
    lastMessageCount: 0,
    audioCtx: null
  };
  window.ComboMessaging = M;

  const EMOJI_LIST = ['👍','❤️','😂','🔥','💪','👏','🎉','😀','😍','😢','😮','🙏','💯','✅','⚡','🏋️','🥗','💧','⏰','👀','😎','🤝','🌟','🎯'];

  /* ────────────────────────────────────────────────
     HELPERS
     ──────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtTime = d => { try { return new Date(d).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); } catch { return ''; } };
  const fmtDate = d => { try { return new Date(d).toLocaleDateString(undefined,{month:'short',day:'numeric'}); } catch { return ''; } };

  function beep(kind = 'receive') {
    if (!M.soundEnabled) return;
    try {
      if (!M.audioCtx) M.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = M.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      const baseFreq = kind === 'send' ? 660 : 880;
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (_) {}
  }

  /* ────────────────────────────────────────────────
     RENDER A SINGLE MESSAGE (with all bells & whistles)
     ──────────────────────────────────────────────── */
  function renderMessage(m, coachId) {
    const own = Number(m.sender_id) === Number(coachId);
    const replies = m.reply_to
      ? `<div class="reply-quote">↩ ${esc((M.messages.find(x => Number(x.id) === Number(m.reply_to))?.body || 'message').slice(0, 80))}</div>`
      : '';

    const attachmentsHtml = (m.attachments || []).map(a => {
      if ((a.mime_type || '').startsWith('image/')) {
        return `<a href="${esc(a.url)}" target="_blank" class="msg-attachment-img">
          <img src="${esc(a.url)}" alt="${esc(a.original_name)}" loading="lazy">
        </a>`;
      }
      return `<a href="${esc(a.url)}" target="_blank" class="msg-attachment-file">
        <i data-lucide="paperclip" class="w-4 h-4"></i>
        <span>${esc(a.original_name)}</span>
        <span class="text-xs opacity-60">${Math.round((a.size_bytes||0)/1024)} KB</span>
      </a>`;
    }).join('');

    // reactions grouped by emoji
    const reactionMap = {};
    (m.reactions || []).forEach(r => {
      (reactionMap[r.emoji] ||= []).push(r);
    });
    const reactionsHtml = Object.entries(reactionMap).map(([emoji, list]) => {
      const mine = list.some(r => Number(r.user_id) === Number(coachId));
      return `<button class="reaction-pill ${mine ? 'mine' : ''}" onclick="ComboMessaging.toggleReaction(${m.id}, '${emoji}')">${emoji} ${list.length}</button>`;
    }).join('');

    const hoverReactions = M.reactionsEnabled ? `
      <div class="msg-hover-reactions">
        ${['👍','❤️','😂'].map(e => `<button onclick="ComboMessaging.toggleReaction(${m.id}, '${e}')">${e}</button>`).join('')}
        <button onclick="ComboMessaging.startReply(${m.id})" title="Reply"><i data-lucide="corner-up-left" class="w-3.5 h-3.5"></i></button>
      </div>` : '';

    return `
      <div class="msg-row ${own ? 'own' : 'other'}" data-msg-id="${m.id}">
        <div class="msg-bubble ${own ? 'bubble-own' : 'bubble-other'}">
          ${replies}
          ${m.body ? `<div class="msg-body">${esc(m.body)}</div>` : ''}
          ${attachmentsHtml}
          ${reactionsHtml ? `<div class="msg-reactions">${reactionsHtml}</div>` : ''}
        </div>
        ${hoverReactions}
        <div class="msg-meta">${own ? 'You' : 'Client'} · ${fmtDate(m.created_at)} ${fmtTime(m.created_at)}</div>
      </div>`;
  }

  /* ────────────────────────────────────────────────
     RENDER FULL THREAD
     ──────────────────────────────────────────────── */
  function renderThread() {
    const host = $('chatMessages');
    if (!host) return;
    if (!M.messages.length) {
      host.innerHTML = `<div class="empty-state"><i data-lucide="message-square"></i><span>No messages yet — say hello.</span></div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    const coachId = (window.currentUser && window.currentUser.id) || 0;
    host.innerHTML = M.messages.map(m => renderMessage(m, coachId)).join('');
    host.scrollTop = host.scrollHeight;
    if (window.lucide) lucide.createIcons();
  }

  /* ────────────────────────────────────────────────
     LOAD THREAD
     ──────────────────────────────────────────────── */
  async function openThread(userId, clientMeta) {
    M.activeUserId = userId;
    M.replyTo = null;
    M.pendingAttachment = null;
    cancelReply();
    updateAttachmentPreview();

    $('chatEmpty').style.display = 'none';
    $('chatPanel').style.display = 'block';
    $('chatClientName').textContent = clientMeta?.name || 'Client';
    $('chatClientEmail').textContent = clientMeta?.email || '';
    $('chatAvatar').textContent = (clientMeta?.name || 'C')[0].toUpperCase();

    const host = $('chatMessages');
    host.innerHTML = `<div class="empty-state"><div class="spinner big"></div></div>`;

    try {
      const data = await window.API.request('/admin/clients/' + encodeURIComponent(userId));
      M.messages = data.messages || [];
      M.lastMessageCount = M.messages.length;
      renderThread();
      startTypingPoll();
    } catch (err) {
      host.innerHTML = `<p class="text-sm text-red-400">${esc(err.message || 'Could not load thread')}</p>`;
    }
  }

  /* ────────────────────────────────────────────────
     SEND MESSAGE
     ──────────────────────────────────────────────── */
  async function sendMessage() {
    const input = $('chatReplyInput');
    const text = (input?.value || '').trim();
    if ((!text && !M.pendingAttachment) || !M.activeUserId) return;

    const sendBtn = $('sendBtn');
    const sendLabel = $('sendBtnLabel');
    if (sendBtn) sendBtn.disabled = true;
    if (sendLabel) sendLabel.textContent = 'Sending…';

    // optimistic bubble
    const optimistic = {
      id: 'temp-' + Date.now(),
      sender_id: (window.currentUser && window.currentUser.id) || 0,
      body: text,
      reply_to: M.replyTo ? M.replyTo.id : null,
      attachments: M.pendingAttachment ? [M.pendingAttachment] : [],
      reactions: [],
      created_at: new Date().toISOString(),
      _optimistic: true
    };
    M.messages.push(optimistic);
    renderThread();
    beep('send');

    try {
      const payload = { body: text || '' };
      if (M.replyTo) payload.reply_to = M.replyTo.id;
      if (M.pendingAttachment) payload.attachment_id = M.pendingAttachment.id;

      const { message } = await window.API.request(
        '/admin/messages/' + encodeURIComponent(M.activeUserId),
        { method: 'POST', body: payload }
      );

      // replace optimistic with real
      M.messages = M.messages.filter(x => x.id !== optimistic.id);
      M.messages.push(message);
      renderThread();

      input.value = '';
      M.replyTo = null;
      M.pendingAttachment = null;
      cancelReply();
      updateAttachmentPreview();
    } catch (err) {
      // rollback
      M.messages = M.messages.filter(x => x.id !== optimistic.id);
      renderThread();
      if (window.showToast) window.showToast(err.message || 'Could not send message', 'error');
      input.value = text;
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (sendLabel) sendLabel.textContent = 'Send';
    }
  }

  /* ────────────────────────────────────────────────
     FILE UPLOAD
     ──────────────────────────────────────────────── */
  async function handleFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!M.attachmentsEnabled) {
      if (window.showToast) window.showToast('Attachments are disabled in settings', 'warning');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      if (window.showToast) window.showToast('File is too large (max 10 MB)', 'error');
      return;
    }

    const preview = $('attachmentPreview');
    preview.style.display = 'flex';
    preview.innerHTML = `<div class="attach-chip loading"><div class="spinner"></div> Uploading ${esc(file.name)}…</div>`;

    try {
      const fd = new FormData();
      fd.append('file', file);

      // Send multipart with raw fetch (bypasses API.request's JSON assumption)
      const res = await fetch(`/api/admin/messages/${encodeURIComponent(M.activeUserId)}/attachments`, {
        method: 'POST',
        credentials: 'same-origin',
        body: fd
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Upload failed (${res.status})`);
      const data = await res.json();

      M.pendingAttachment = data.attachment;
      updateAttachmentPreview();
      if (window.showToast) window.showToast('File ready to send', 'success');
    } catch (err) {
      preview.innerHTML = `<div class="attach-chip error">Failed to upload</div>`;
      if (window.showToast) window.showToast(err.message || 'Upload failed', 'error');
      setTimeout(() => { preview.style.display = 'none'; }, 2000);
    }
  }

  function updateAttachmentPreview() {
    const preview = $('attachmentPreview');
    if (!preview) return;
    if (!M.pendingAttachment) { preview.style.display = 'none'; preview.innerHTML = ''; return; }
    const a = M.pendingAttachment;
    preview.style.display = 'flex';
    preview.innerHTML = `
      <div class="attach-chip">
        <i data-lucide="paperclip" class="w-3.5 h-3.5"></i>
        <span>${esc(a.original_name)}</span>
        <button onclick="ComboMessaging.cancelAttachment()" aria-label="Remove"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
      </div>`;
    if (window.lucide) lucide.createIcons();
  }

  /* ────────────────────────────────────────────────
     EMOJI PICKER
     ──────────────────────────────────────────────── */
  function toggleEmojiPicker() {
    const picker = $('emojiPicker');
    if (!picker) return;
    const open = picker.style.display !== 'none';
    if (open) { picker.style.display = 'none'; return; }
    const grid = picker.querySelector('.emoji-grid');
    if (grid && !grid.dataset.built) {
      grid.innerHTML = EMOJI_LIST.map(e => `<button type="button" onclick="ComboMessaging.insertEmoji('${e}')">${e}</button>`).join('');
      grid.dataset.built = '1';
    }
    picker.style.display = 'block';
  }

  function insertEmoji(emoji) {
    const input = $('chatReplyInput');
    if (!input) return;
    input.value += emoji;
    input.focus();
    $('emojiPicker').style.display = 'none';
  }

  /* ────────────────────────────────────────────────
     REPLY
     ──────────────────────────────────────────────── */
  function startReply(messageId) {
    const m = M.messages.find(x => Number(x.id) === Number(messageId));
    if (!m) return;
    M.replyTo = { id: m.id, body: m.body || '[attachment]' };
    const preview = $('replyPreview');
    const body = $('replyPreviewBody');
    if (preview && body) {
      body.textContent = M.replyTo.body.slice(0, 100);
      preview.style.display = 'flex';
    }
    $('chatReplyInput')?.focus();
  }

  function cancelReply() {
    M.replyTo = null;
    const preview = $('replyPreview');
    if (preview) preview.style.display = 'none';
  }

  /* ────────────────────────────────────────────────
     REACTIONS
     ──────────────────────────────────────────────── */
  async function toggleReaction(messageId, emoji) {
    if (!M.reactionsEnabled) {
      if (window.showToast) window.showToast('Reactions are disabled', 'warning');
      return;
    }
    const m = M.messages.find(x => Number(x.id) === Number(messageId));
    if (!m) return;
    const coachId = (window.currentUser && window.currentUser.id) || 0;

    // optimistic
    m.reactions = m.reactions || [];
    const existing = m.reactions.findIndex(r => Number(r.user_id) === Number(coachId) && r.emoji === emoji);
    if (existing >= 0) m.reactions.splice(existing, 1);
    else m.reactions.push({ user_id: coachId, emoji });
    renderThread();

    try {
      await window.API.request(
        `/admin/messages/${encodeURIComponent(messageId)}/reactions`,
        { method: 'POST', body: { emoji } }
      );
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Could not react', 'error');
      // reload to sync
      if (M.activeUserId) {
        const data = await window.API.request('/admin/clients/' + encodeURIComponent(M.activeUserId));
        M.messages = data.messages || [];
        renderThread();
      }
    }
  }

  /* ────────────────────────────────────────────────
     TYPING
     ──────────────────────────────────────────────── */
  let typingSignalTimer = null;
  function onComposerInput() {
    if (!M.typingEnabled || !M.activeUserId) return;
    clearTimeout(typingSignalTimer);
    // signal once every 2s while typing
    window.API.request(
      `/admin/messages/${encodeURIComponent(M.activeUserId)}/typing`,
      { method: 'POST', body: {} }
    ).catch(() => {});
    typingSignalTimer = setTimeout(() => {
      typingSignalTimer = null;
    }, 2000);

    // auto-grow textarea
    const ta = $('chatReplyInput');
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
  }

  function onComposerKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function startTypingPoll() {
    stopTypingPoll();
    if (!M.typingEnabled || !M.activeUserId) return;
    M.typingPollTimer = setInterval(async () => {
      if (!M.activeUserId) return;
      try {
        const { typing } = await window.API.request(
          `/admin/messages/${encodeURIComponent(M.activeUserId)}/typing`
        );
        const el = $('chatTypingIndicator');
        if (el) el.style.display = typing ? 'inline' : 'none';
      } catch (_) {}
    }, 3000);
  }
  function stopTypingPoll() {
    if (M.typingPollTimer) { clearInterval(M.typingPollTimer); M.typingPollTimer = null; }
  }

  /* ────────────────────────────────────────────────
     SOUND / SETTINGS TOGGLES
     ──────────────────────────────────────────────── */
  function toggleSound() {
    M.soundEnabled = !M.soundEnabled;
    const icon = $('soundIcon');
    const label = $('soundLabel');
    if (icon) icon.setAttribute('data-lucide', M.soundEnabled ? 'volume-2' : 'volume-x');
    if (label) label.textContent = M.soundEnabled ? 'Sound on' : 'Sound off';
    if (window.lucide) lucide.createIcons();
    if (window.showToast) window.showToast(M.soundEnabled ? 'Sound enabled' : 'Sound muted', 'info');
  }

  function applySettingsToUI(s) {
    if (!s) return;
    M.soundEnabled = s.sound_enabled !== false;
    M.typingEnabled = s.typing_indicator_enabled !== false;
    M.reactionsEnabled = s.reactions_enabled !== false;
    M.attachmentsEnabled = s.attachments_enabled !== false;
    M.receiptsEnabled = s.read_receipts_enabled !== false;

    if ($('toggleSound')) $('toggleSound').checked = M.soundEnabled;
    if ($('toggleTyping')) $('toggleTyping').checked = M.typingEnabled;
    if ($('toggleReactions')) $('toggleReactions').checked = M.reactionsEnabled;
    if ($('toggleAttachments')) $('toggleAttachments').checked = M.attachmentsEnabled;
    if ($('toggleReceipts')) $('toggleReceipts').checked = M.receiptsEnabled;

    const icon = $('soundIcon');
    const label = $('soundLabel');
    if (icon) icon.setAttribute('data-lucide', M.soundEnabled ? 'volume-2' : 'volume-x');
    if (label) label.textContent = M.soundEnabled ? 'Sound on' : 'Sound off';
    if (window.lucide) lucide.createIcons();
  }

  /* ────────────────────────────────────────────────
     EXPORT API
     ──────────────────────────────────────────────── */
  window.ComboMessaging.openThread = openThread;
  window.ComboMessaging.sendMessage = sendMessage;
  window.ComboMessaging.handleFileSelected = handleFileSelected;
  window.ComboMessaging.updateAttachmentPreview = updateAttachmentPreview;
  window.ComboMessaging.cancelAttachment = () => { M.pendingAttachment = null; updateAttachmentPreview(); };
  window.ComboMessaging.toggleEmojiPicker = toggleEmojiPicker;
  window.ComboMessaging.insertEmoji = insertEmoji;
  window.ComboMessaging.startReply = startReply;
  window.ComboMessaging.cancelReply = cancelReply;
  window.ComboMessaging.toggleReaction = toggleReaction;
  window.ComboMessaging.onComposerInput = onComposerInput;
  window.ComboMessaging.onComposerKey = onComposerKey;
  window.ComboMessaging.toggleSound = toggleSound;
  window.ComboMessaging.applySettingsToUI = applySettingsToUI;
  window.ComboMessaging.renderThread = renderThread;
  window.ComboMessaging.beep = beep;
})();