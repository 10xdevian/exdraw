export function DrawCanva(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  let clicked = false;
  let startX = 0;
  let startY = 0;

  canvas.addEventListener("mouseup", (event) => {
    clicked = false;
    startX = event.clientX;
    startY = event.clientY;
  });
  canvas.addEventListener("mousedown", (event) => {
    clicked = true;
    console.log(event.clientX);
    console.log(event.clientY);
  });
  canvas.addEventListener("mousemove", (event) => {
    if (clicked) {
      const width = event.clientX - startX;

      const hight = event.clientY - startY;

      ctx.clearRect(0, 0, canvas.height, canvas.width);
      ctx.strokeRect(startX, startY, width, hight);
    }
  });
}
