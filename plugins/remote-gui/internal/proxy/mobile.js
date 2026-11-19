import keysyms from '/core/input/keysymdef.js';

// The second tap runs focus() directly in a trusted click. Editing uses
// ordinary noVNC keys, so the remote browser's current focus receives them.
export function mobileKeyboard(rfb, screen, panel, onFocusReturn) {
    const prompt = document.getElementById('mobile-type');
    const editor = document.getElementById('mobile-editor');
    const hint = document.getElementById('mobile-hint');
    const canvas = screen.querySelector('canvas');
    let epoch = 0;
    let timer = 0;
    let expiryTimer = 0;
    let awaiting = false;
    let phaseTimer = 0;
    let phaseRequest = null;
    let observedPhase = 0;
    let request = null;
    let target = null;
    let lease = 0;
    let editing = false;
    let composing = false;
    let baseHeight = 0;
    let keyboardSeen = false;

    function clear() {
        epoch++;
        clearTimeout(timer);
        clearTimeout(expiryTimer);
        clearTimeout(phaseTimer);
        phaseRequest?.abort();
        phaseRequest = null;
        awaiting = false;
        request?.abort();
        request = null;
        target = null;
        lease = 0;
        composing = false;
        const wasEditing = editing;
        editing = false;
        prompt.hidden = true;
        hint.hidden = true;
        editor.value = '';
        editor.blur();
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
        editor.style.left = Math.max(4, Math.min(innerWidth - 10, centerX)) + 'px';
        editor.style.top = Math.max(36, Math.min(viewportHeight() - 24, centerY)) + 'px';
    }

    const metadataHeaders = { 'Content-Type': 'application/json', 'X-Remote-Gui-Editable': '1' };

    async function watchPhase(generation) {
        const controller = new AbortController();
        phaseRequest = controller;
        const timeout = setTimeout(() => controller.abort(), 350);
        try {
            const reply = await fetch('/__remote_gui/editable-phase', {
                method: 'POST', credentials: 'same-origin', cache: 'no-store',
                headers: metadataHeaders, signal: controller.signal,
            });
            const phase = await reply.json();
            if (generation !== epoch) return;
            if (!reply.ok || !Number.isSafeInteger(phase) || phase < 1 || phase < observedPhase) {
                clear();
                return;
            }
            observedPhase = phase;
            if (target && target.phase !== phase) { clear(); return; }
            phaseTimer = setTimeout(() => void watchPhase(generation), 100);
        } catch {
            if (generation === epoch) clear();
        } finally {
            clearTimeout(timeout);
            if (phaseRequest === controller) phaseRequest = null;
        }
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
            if (!response.ok) throw Error('editable focus unavailable');
            const field = await response.json();
            if (generation !== epoch) return;
            if (performance.now() >= started + 500) { clear(); return; }
            if (!field && !target && attempt < 4) {
                timer = setTimeout(() => void sample(point, generation, attempt + 1), 75);
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
            expiryTimer = setTimeout(clear, Math.max(0, lease - performance.now()));
            if (!editing) {
                position(field);
                prompt.hidden = false;
            }
            timer = setTimeout(() => void sample(point, generation, attempt), Math.max(0, 170 - (performance.now() - started)));
        } catch {
            if (generation === epoch) clear();
        } finally {
            clearTimeout(deadline);
            if (request === controller) request = null;
        }
    }

    function validEdit() {
        if (!editing) return false;
        if (performance.now() < lease) return true;
        clear();
        return false;
    }

    function insert(text) {
        if (validEdit()) {
            for (const character of text) rfb.sendKey(keysyms.lookup(character.codePointAt(0)));
        }
        editor.value = '';
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
        keyboardSeen = false;
        baseHeight = viewportHeight();
        prompt.hidden = true;
        hint.hidden = false;
        rfb.focusOnClick = false;
        rfb.blur();
        editor.focus({ preventScroll: true });
    });

    editor.addEventListener('blur', () => { if (editing) clear(); });
    editor.addEventListener('compositionstart', () => { composing = true; });
    editor.addEventListener('compositionend', event => {
        composing = false;
        insert(event.data ?? '');
    });
    editor.addEventListener('beforeinput', event => {
        if (composing || event.isComposing) return;
        if (event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward') {
            event.preventDefault();
            if (!validEdit()) return;
            if (event.inputType === 'deleteContentBackward') rfb.sendKey(0xff08, 'Backspace');
            else rfb.sendKey(0xffff, 'Delete');
        }
    });
    editor.addEventListener('input', event => {
        if (composing || event.isComposing) return;
        if (event.inputType === 'insertCompositionText' || event.inputType === 'insertFromComposition') {
            editor.value = '';
            return;
        }
        insert(editor.value);
    });
    editor.addEventListener('keydown', event => {
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
    new ResizeObserver(() => { if (!editing && (target || awaiting)) clear(); }).observe(canvas);
    window.visualViewport?.addEventListener('resize', () => {
        if (!editing) { if (target || awaiting) clear(); return; }
        const height = viewportHeight();
        if (height < baseHeight - 90) keyboardSeen = true;
        else if (keyboardSeen) clear();
    });

    return {
        cancel: clear,
        get editing() { return editing; },
    };
}
