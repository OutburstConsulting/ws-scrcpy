// Grid Overlay Script for ws-scrcpy
// Paste this into the browser console to toggle the grid overlay on/off
// Coordinates shown are relative to the device screen canvas
//
// Usage:
//   gridOverlay()                         - Toggle grid on/off
//   gridOverlay([{x:100,y:200}, {x:300,y:400}])  - Show numbered click sequence

function gridOverlay(clicks = []) {
  const GRID_SIZE = 12;
  const existing = document.getElementById('coord-grid-overlay');
  if (existing) {
    existing.remove();
    document.getElementById('coord-label')?.remove();
    document.querySelectorAll('.coord-click-marker').forEach(el => el.remove());
    return;
  }

  const canvas = document.querySelector('canvas.touch-layer');
  if (!canvas) { console.error('Canvas .touch-layer not found'); return; }

  const rect = canvas.getBoundingClientRect();

  const overlay = document.createElement('div');
  overlay.id = 'coord-grid-overlay';
  overlay.style.cssText = `
    position: absolute; top: ${rect.top + window.scrollY}px; left: ${rect.left + window.scrollX}px;
    width: ${rect.width}px; height: ${rect.height}px;
    pointer-events: none; z-index: 999999;
    background-image:
      linear-gradient(rgba(255,0,0,0.4) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,0,0,0.4) 1px, transparent 1px);
    background-size: ${GRID_SIZE}px ${GRID_SIZE}px;
  `;

  const label = document.createElement('div');
  label.id = 'coord-label';
  label.style.cssText = `
    position: fixed; top: 10px; right: 10px; z-index: 1000000;
    background: rgba(0,0,0,0.85); color: #0f0; padding: 8px 12px;
    font: bold 14px monospace; border-radius: 4px; pointer-events: none;
  `;
  label.textContent = 'Hover canvas for coords';

  document.body.appendChild(overlay);
  document.body.appendChild(label);

  // Add numbered click markers
  clicks.forEach((click, index) => {
    const marker = document.createElement('div');
    marker.className = 'coord-click-marker';
    marker.style.cssText = `
      position: absolute;
      top: ${rect.top + window.scrollY + click.y - 15}px;
      left: ${rect.left + window.scrollX + click.x - 15}px;
      width: 30px; height: 30px;
      background: rgba(0, 120, 255, 0.8);
      border: 2px solid #fff;
      border-radius: 50%;
      color: #fff;
      font: bold 14px sans-serif;
      display: flex; align-items: center; justify-content: center;
      pointer-events: none; z-index: 1000000;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    `;
    marker.textContent = index + 1;
    document.body.appendChild(marker);
  });

  const handler = (e) => {
    const r = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - r.left);
    const y = Math.round(e.clientY - r.top);
    if (x >= 0 && y >= 0 && x <= r.width && y <= r.height) {
      label.textContent = `X: ${x}  Y: ${y}`;
    }
  };

  const clickHandler = (e) => {
    const r = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - r.left);
    const y = Math.round(e.clientY - r.top);
    if (x >= 0 && y >= 0 && x <= r.width && y <= r.height) {
      console.log(`{ x: ${x}, y: ${y} }`);
    }
  };

  canvas.addEventListener('mousemove', handler);
  canvas.addEventListener('click', clickHandler);

  window._gridCleanup = () => {
    canvas.removeEventListener('mousemove', handler);
    canvas.removeEventListener('click', clickHandler);
  };

  console.log('Grid overlay active. Call gridOverlay() again to remove.');
  if (clicks.length) {
    console.log(`Showing ${clicks.length} numbered click markers.`);
  }
}

// Examples:
// gridOverlay()
// gridOverlay([{ x: 200, y: 454 }, { x: 20, y: 68 }, { x: 57, y: 318 }, { x: 286, y: 259 }, { x: 20, y: 68 }, { x: 67, y: 175 }])
// gridOverlay([{ x: 156, y: 532 }, { x: 160, y: 594 }, { x: 226, y: 585 }])
