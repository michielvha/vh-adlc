import GestureHandler from "./novnc/core/input/gesturehandler.js";

const surface = document.getElementById("surface");
const result = document.getElementById("result");
const editor = document.getElementById("editor");
const paint = surface.getContext("2d");
paint.fillStyle = "#e9f2ff";
paint.fillRect(0, 0, 640, 160);
paint.fillStyle = "#f1f1f3";
paint.fillRect(0, 160, 640, 160);
paint.fillStyle = "#181824";
paint.font = "30px system-ui";
paint.textAlign = "center";
paint.fillText("Editable area", 320, 90);
paint.fillText("Plain area", 320, 250);

const gestures = new GestureHandler();
gestures.attach(surface);
surface.addEventListener("gesturestart", ({detail}) => {
    if (detail.type !== "onetap") return;
    const bounds = surface.getBoundingClientRect();
    if (detail.clientY >= bounds.top + bounds.height / 2) {
        editor.blur();
        result.textContent = "Plain area tapped";
        return;
    }
    editor.focus({preventScroll: true});
    result.textContent = "Editable area tapped";
});
result.textContent = "Gesture probe ready";
