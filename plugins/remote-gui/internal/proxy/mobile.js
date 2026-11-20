import keysyms from '/core/input/keysymdef.js';

// The second tap runs focus() directly in a trusted click. Editing uses
// ordinary noVNC keys, so the remote browser's current focus receives them.
export function mobileKeyboard(rfb, screen, panel, onEditingStart, onFocusReturn) {
    const prompt = document.getElementById('mobile-type');
    const editor = document.getElementById('mobile-editor');
    const hint = document.getElementById('mobile-hint');
    const editingHint = hint.textContent;
    const canvas = screen.querySelector('canvas');
    let epoch = 0;
    let timer = 0;
    let expiryTimer = 0;
    let awaiting = false;
    let phaseTimer = 0;
    let phaseRequest = null;
    let observedPhase = 0;
    let phaseReady = false;
    let request = null;
    let target = null;
    let framebuffer = '';
    let lease = 0;
    let editing = false;
    let composing = false;
    let discardComposition = false;
    let committed = '';
    let missedInput = false;
    let recoveryTimer = 0;
    let baseHeight = 0;
    let keyboardSeen = false;
    let keyboardCloseTimer = 0;
    const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

    function clear() {
        epoch++;
        clearTimeout(timer);
        clearTimeout(expiryTimer);
        clearTimeout(phaseTimer);
        clearTimeout(recoveryTimer);
        recoveryTimer = 0;
        clearTimeout(keyboardCloseTimer);
        phaseRequest?.abort();
        phaseRequest = null;
        phaseReady = false;
        awaiting = false;
        request?.abort();
        request = null;
        target = null;
        framebuffer = '';
        lease = 0;
        composing = false;
        discardComposition = false;
        committed = '';
        missedInput = false;
        const wasEditing = editing;
        editing = false;
        prompt.hidden = true;
        hint.hidden = true;
        editor.value = '';
        editor.blur();
        editor.hidden = true;
        if (wasEditing) onFocusReturn();
    }

    function viewportHeight() {
        return window.visualViewport?.height ?? window.innerHeight;
    }

    function position(field) {
        const bounds = canvas.getBoundingClientRect();
        const centerX = bounds.left + (field.x + field.width / 2) * bounds.width / canvas.width;
        const centerY = bounds.top + (field.y + field.height / 2) * bounds.height / canvas.height;
        prompt.style.left = Math.max(4, Math.min(innerWidth - 116, centerX - 56)) + 'px';
        prompt.style.top = Math.max(36, Math.min(viewportHeight() - 48, centerY - 22)) + 'px';
    }

    function updatePromptLayout() {
        if (editing || (!target && !awaiting)) return;
        if (framebuffer !== canvas.width + 'x' + canvas.height) clear();
        else if (target) position(target);
    }

    const metadataHeaders = { 'Content-Type': 'application/json', 'X-Remote-Gui-Editable': '1' };

    function canSend() {
        return phaseReady && performance.now() < lease;
    }

    function updateEditingStatus() {
        if (!editing) return;
        let message = editingHint;
        if (canSend()) {
            clearTimeout(recoveryTimer);
            recoveryTimer = 0;
            if (missedInput) message = 'Typing resumed. Re-enter missed keys.';
        } else {
            if (!recoveryTimer) {
                if (composing) {
                    discardComposition = true;
                    missedInput = true;
                    editor.value = committed;
                }
                recoveryTimer = setTimeout(clear, 3000);
            }
            message = 'Typing paused. Checking connection…';
        }
        if (hint.textContent !== message) hint.textContent = message;
    }

    function phaseUnavailable(generation) {
        if (!editing) { clear(); return; }
        phaseReady = false;
        updateEditingStatus();
        phaseTimer = setTimeout(() => void watchPhase(generation), 100);
    }

    async function watchPhase(generation) {
        const controller = new AbortController();
        phaseRequest = controller;
        const timeout = setTimeout(() => controller.abort(), 350);
        try {
            const reply = await fetch('/__remote_gui/editable-phase', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store',
                headers: metadataHeaders, signal: controller.signal,
            });
            if (generation !== epoch) return;
            if (reply.status === 503) { phaseUnavailable(generation); return; }
            const phase = await reply.json();
            if (generation !== epoch) return;
            if (!reply.ok || !Number.isSafeInteger(phase) || phase < 1 || phase < observedPhase) {
                clear();
                return;
            }
            observedPhase = phase;
            if (target && target.phase !== phase) { clear(); return; }
            phaseReady = true;
            updateEditingStatus();
            phaseTimer = setTimeout(() => void watchPhase(generation), 100);
        } catch (error) {
            if (generation === epoch) {
                if (error.name === 'AbortError' || error instanceof TypeError) phaseUnavailable(generation);
                else clear();
            }
        } finally {
            clearTimeout(timeout);
            if (phaseRequest === controller) phaseRequest = null;
        }
    }

    function retrySample(point, generation, attempt) {
        // A temporary failure never extends a verified association.
        if (target ? editing || performance.now() < lease : attempt < 4) {
            const delay = target ? 20 : 75 * (attempt + 1);
            timer = setTimeout(() => void sample(point, generation, attempt + 1), delay);
        } else clear();
    }

    async function sample(point, generation, attempt) {
        if (generation !== epoch || !panel.hidden) return;
        const controller = new AbortController();
        request = controller;
        const started = performance.now();
        const deadline = setTimeout(() => controller.abort(), 460);
        try {
            const response = await fetch('/__remote_gui/editable', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
                headers: metadataHeaders,
                body: JSON.stringify(point),
            });
            if (generation !== epoch) return;
            if (response.status === 503) { retrySample(point, generation, attempt); return; }
            if (!response.ok) throw Error('editable focus unavailable');
            const field = await response.json();
            if (generation !== epoch) return;
            if (performance.now() >= started + 500) { retrySample(point, generation, attempt); return; }
            if (!field && !target) {
                retrySample(point, generation, attempt);
                return;
            }
            if (!field || field.phase < observedPhase || (target && (field.token !== target.token || field.mode !== target.mode || field.phase !== target.phase))) {
                clear();
                return;
            }
            if (target && !editing && ['x', 'y', 'width', 'height'].some(k => field[k] !== target[k])) {
                clear();
                return;
            }
            observedPhase = field.phase;
            target = field;
            awaiting = false;
            lease = started + 500;
            clearTimeout(expiryTimer);
            expiryTimer = setTimeout(() => {
                if (editing) updateEditingStatus();
                else clear();
            }, Math.max(0, Math.ceil(lease - performance.now())));
            if (!editing) {
                position(field);
                prompt.hidden = false;
            }
            updateEditingStatus();
            timer = setTimeout(() => void sample(point, generation, attempt), Math.max(0, 170 - (performance.now() - started)));
        } catch (error) {
            if (generation === epoch) {
                if (error.name === 'AbortError' || error instanceof TypeError) retrySample(point, generation, attempt);
                else clear();
            }
        } finally {
            clearTimeout(deadline);
            if (request === controller) request = null;
        }
    }

    function validEdit() {
        if (!editing) return false;
        if (canSend()) return true;
        missedInput = true;
        editor.value = committed;
        updateEditingStatus();
        return false;
    }

    function syncInput() {
        if (!validEdit()) return;
        const value = editor.value;
        let start = committed.length;
        if (!value.startsWith(committed)) {
            // Like noVNC's editor, replay the changed suffix using ordinary
            // Backspace and text keys. Backspace removes a whole grapheme.
            start = 0;
            let changed = false;
            for (const { segment, index } of graphemes.segment(committed)) {
                if (!changed && value.startsWith(segment, index)) start = index + segment.length;
                else {
                    changed = true;
                    rfb.sendKey(0xff08, 'Backspace');
                }
            }
        }
        for (const character of value.slice(start)) rfb.sendKey(keysyms.lookup(character.codePointAt(0)));
        committed = value;
        if (editor.type === 'password') {
            committed = '';
            editor.value = '';
        }
    }

    canvas.addEventListener('gesturestart', event => {
        clear();
        if (event.detail?.type !== 'onetap' || !panel.hidden) return;
        // noVNC handles this event first. The dispatched point can be snapped
        // to an earlier tap, so raw gesture coordinates would be wrong.
        const position = rfb._mousePos;
        const display = rfb._display;
        if (!position || typeof display?.absX !== 'function' || typeof display.absY !== 'function') return;
        const x = display.absX(position.x);
        const y = display.absY(position.y);
        if (![x, y].every(value => Number.isInteger(value) && value >= 0 && value < 4096)) return;
        const generation = epoch;
        framebuffer = canvas.width + 'x' + canvas.height;
        awaiting = true;
        void watchPhase(generation);
        timer = setTimeout(() => void sample({ x, y }, generation, 0), 75);
    });

    prompt.addEventListener('click', event => {
        if (!event.isTrusted || !target || performance.now() >= lease) { clear(); return; }
        const mode = target.mode;
        editor.type = mode === 'password' ? 'password' : 'text';
        editor.inputMode = mode === 'number' ? 'numeric' : mode === 'password' ? 'text' : mode;
        editing = true;
        updateEditingStatus();
        onEditingStart();
        keyboardSeen = false;
        baseHeight = viewportHeight();
        prompt.hidden = true;
        hint.hidden = false;
        rfb.focusOnClick = false;
        rfb.blur();
        editor.hidden = false;
        editor.focus({ preventScroll: true });
    });

    editor.addEventListener('blur', () => { if (editing) clear(); });
    editor.addEventListener('compositionstart', () => {
        composing = true;
        discardComposition = !canSend();
    });
    editor.addEventListener('compositionend', () => {
        composing = false;
        if (discardComposition) {
            missedInput = true;
            editor.value = committed;
            updateEditingStatus();
            return;
        }
        syncInput();
    });
    editor.addEventListener('beforeinput', event => {
        if (composing || event.isComposing) return;
        if ((event.inputType === 'deleteContentBackward' && !editor.value) ||
            (event.inputType === 'deleteContentForward' && editor.selectionStart === editor.value.length)) {
            event.preventDefault();
            if (!validEdit()) return;
            if (event.inputType === 'deleteContentBackward') rfb.sendKey(0xff08, 'Backspace');
            else rfb.sendKey(0xffff, 'Delete');
        }
    });
    editor.addEventListener('input', event => {
        if (composing || event.isComposing) return;
        if (discardComposition && (event.inputType === 'insertFromComposition' || event.inputType === 'insertCompositionText')) {
            editor.value = committed;
            return;
        }
        discardComposition = false;
        syncInput();
    });
    editor.addEventListener('keydown', event => {
        if (event.key === 'Backspace' && !editor.value && !composing && !event.isComposing) {
            event.preventDefault();
            if (validEdit()) rfb.sendKey(0xff08, 'Backspace');
        }
        if (event.key === 'Enter' && !composing && !event.isComposing) {
            event.preventDefault();
            if (validEdit()) rfb.sendKey(0xff0d, 'Enter');
        }
    });

    window.addEventListener('blur', clear);
    window.addEventListener('pagehide', clear);
    canvas.addEventListener('wheel', clear);
    rfb.addEventListener('disconnect', clear);
    rfb.addEventListener('securityfailure', clear);
    window.addEventListener('orientationchange', clear);
    new ResizeObserver(updatePromptLayout).observe(canvas);
    window.visualViewport?.addEventListener('resize', () => {
        if (!editing) { updatePromptLayout(); return; }
        const height = viewportHeight();
        clearTimeout(keyboardCloseTimer);
        if (height < baseHeight - 90) keyboardSeen = true;
        else if (keyboardSeen && height >= baseHeight - 40) keyboardCloseTimer = setTimeout(clear, 250);
    });

    return {
        cancel: clear,
        get editing() { return editing; },
    };
}
