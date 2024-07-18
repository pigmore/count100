import {Movement,
   Circle,
   Particle,
   Firework,
   Button,
   Texts,
    CanvasContext, DemoSettings, Intersecting} from './components.js';
export function random(a, b) {
  return Math.random() * (b - a) + a;
}
export function genFirework(x,y){
  for (var i = 0; i < 100; i++) {
    var entity3 = window.world
      .createEntity()
      .addComponent(Firework)

    var i0 = entity3.getMutableComponent(Firework);
    i0.position.set(screenFixX(x + random(-15,15)),screenFixY(y + random(-15,15)));
    // i0.size.set(300, 350);
    i0.color = `rgb(${random(0,255)}, ${random(0,255)},${random(0,255)})`;
    i0.count = random(0,10)
    i0.rotate = random(0,6.28)
    i0.height = random(414,1600)
  }
}
export function genParticles(x,y,c){
  // for (var i = 0; i < 50; i++) {
    var entity3 = window.world
      .createEntity()
      .addComponent(Particle)

    var i0 = entity3.getMutableComponent(Particle);
    i0.position.set(screenFixX(x),screenFixY(y));
    // i0.size.set(300, 350);
    i0.color = c;
    i0.count = 0
    // i0.rotate = random(0,6.28)
    // i0.height = random(414,1600)

}

export function intersection(circleA, circleB) {
  var a, dx, dy, d, h, rx, ry;
  var x2, y2;

  // dx and dy are the vertical and horizontal distances between the circle centers.
  dx = circleB.position.x - circleA.position.x;
  dy = circleB.position.y - circleA.position.y;

  // Distance between the centers
  d = Math.sqrt(dy * dy + dx * dx);

  // Check for solvability
  if (d > circleA.radius + circleB.radius) {
    // No solution: circles don't intersect
    return false;
  }
  if (d < Math.abs(circleA.radius - circleB.radius)) {
    // No solution: one circle is contained in the other
    return false;
  }

  /* 'point 2' is the point where the line through the circle
   * intersection points crosses the line between the circle
   * centers.
   */

  /* Determine the distance from point 0 to point 2. */
  a =
    (circleA.radius * circleA.radius -
      circleB.radius * circleB.radius +
      d * d) /
    (2.0 * d);

    var angle = Math.atan2(dy, dx),
            tx = circleA.position.x + Math.cos(angle) * (circleA.radius + circleB.radius),
            ty = circleA.position.y + Math.sin(angle) * (circleA.radius + circleB.radius),
            ax = (tx - circleB.position.x),
            ay = (ty - circleB.position.y);
  /* Determine the coordinates of point 2. */
  x2 = circleA.position.x + (dx * a) / d;
  y2 = circleA.position.y + (dy * a) / d;

  /* Determine the distance from point 2 to either of the
   * intersection points.
   */
  h = Math.sqrt(circleA.radius * circleA.radius - a * a);

  /* Now determine the offsets of the intersection points from
   * point 2.
   */
  rx = -dy * (h / d);
  ry = dx * (h / d);

  /* Determine the absolute intersection points. */
  var xi = x2 + rx;
  var xi_prime = x2 - rx;
  var yi = y2 + ry;
  var yi_prime = y2 - ry;

  return [xi, yi, xi_prime, yi_prime, ax, ay];
}

export function fillCircle(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2, false);
  ctx.fill();

  return this;
}

export function drawLine(ctx, a, b, c, d) {
  ctx.beginPath(), ctx.moveTo(a, b), ctx.lineTo(c, d), ctx.stroke();
}
export function drawRoundedRect(ctx, x, y, w, h,r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y,   x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x,   y+h, r);
  ctx.arcTo(x,   y+h, x,   y,   r);
  ctx.arcTo(x,   y,   x+w, y,   r);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  return this;
}
export function screenFixX(_x) {
  return Math.floor((window.innerWidth - 375) / 2 + _x)
}
export function screenFixY(_y) {
  return Math.floor((window.innerHeight - 812) / 2 + _y)
}

export function genButton(world,x,y,w,h,t,l=false,s=0,c=false,sn,_topindex = 0) {
  console.log('genButton')
  var textArray = [
    '挑战',
    '生存模式',
    '生存模式+',
    '快跑模式',
    '重力模式',
    '返回',
    '重试',
    '下一关？',
    '排行榜',
    '开始',
    '重试',
    '重试',
    '+1',
    '+',
  ]
  var entity2 = world
    .createEntity()
    .addComponent(Texts)
  var t2 = entity2.getMutableComponent(Texts);
  t2.position.set(screenFixX(x + 3 - (textArray.indexOf(t) > -1 ? 2:0)), screenFixY(y + 24 - (textArray.indexOf(t) > -1 ? 14:9)));
  t2.text = t;
  t2.size = textArray.indexOf(t) > -1 ? 30 : 24;
  t2.color = l?'#bbb':'#ffffff';

  var entity3 = world
    .createEntity()
    .addComponent(Button)
  var i0 = entity3.getMutableComponent(Button);
  i0.position.set(screenFixX(x - w/2), screenFixY(y- h/2));
  i0.size.set(w, h);

  if (l) {
    var entity3 = world
      .createEntity()
      .addComponent(Images)
    var i0 = entity3.getMutableComponent(Images);
    i0.position.set(screenFixX(x + w/2 - 12), screenFixY(y+ h/2 - 18));
    i0.size.set(24, 27);
    i0.src = window.lockImg;
    i0.aboveBtn = true;
    if (c) {
      var entity2 = world
        .createEntity()
        .addComponent(Texts)
      var t2 = entity2.getMutableComponent(Texts);
      t2.position.set(screenFixX(x + w/2 +10), screenFixY(y- h/2 + 24));
      t2.text = sn;
      t2.size = 12;
      t2.color = '#ffffff';
      var entity3 = world
        .createEntity()
        .addComponent(Images)
      var i0 = entity3.getMutableComponent(Images);
      i0.position.set(screenFixX(x + w/2 - 24), screenFixY(y- h/2 + 2));
      i0.size.set(27, 27);
      i0.src = window.singlestarImg;
      i0.aboveBtn = true;
    }
  }else{
    if (c) {
      var entity2 = world
        .createEntity()
        .addComponent(Texts)
      var t2 = entity2.getMutableComponent(Texts);
      t2.position.set(screenFixX(x + w/2 + 26), screenFixY(y- 0 + 22));
      // console.log('_topindex',_topindex)
      t2.text = `${window.top100Index[_topindex] >=0 ? 'No.' + (window.top100Index[_topindex] + 1) :'No.100+'}`;
      t2.size = 12;
      t2.color = '#ffffff';
      var entity3 = world
        .createEntity()
        .addComponent(Images)
      var i0 = entity3.getMutableComponent(Images);
      i0.position.set(screenFixX(x + w/2 + 10), screenFixY(y- 0 - 28));
      i0.size.set(32, 32);
      i0.src = window.cupImg;
      // i0.aboveBtn = true;
    }
    switch (s) {
      case 3:
        var entity3 = world
          .createEntity()
          .addComponent(Images)
        var i0 = entity3.getMutableComponent(Images);
        i0.position.set(screenFixX(x - 24), screenFixY(y - h/2 - 12));
        i0.size.set(24, 24);
        i0.src = window.singlestarImg;
        i0.aboveBtn = true;
        var entity3 = world
          .createEntity()
          .addComponent(Images)
        var i0 = entity3.getMutableComponent(Images);
        i0.position.set(screenFixX(x - 0), screenFixY(y - h/2 - 12));
        i0.size.set(24, 24);
        i0.src = window.singlestarImg;
        i0.aboveBtn = true;
        var entity3 = world
          .createEntity()
          .addComponent(Images)
        var i0 = entity3.getMutableComponent(Images);
        i0.position.set(screenFixX(x - 16), screenFixY(y - h/2 - 18));
        i0.size.set(32, 32);
        i0.src = window.singlestarImg;
        i0.aboveBtn = true;
        break;
      case 2:
        var entity3 = world
          .createEntity()
          .addComponent(Images)
        var i0 = entity3.getMutableComponent(Images);
        i0.position.set(screenFixX(x - 18), screenFixY(y - h/2 - 12));
        i0.size.set(24, 24);
        i0.src = window.singlestarImg;
        i0.aboveBtn = true;

        var entity3 = world
          .createEntity()
          .addComponent(Images)
        var i0 = entity3.getMutableComponent(Images);
        i0.position.set(screenFixX(x - 6), screenFixY(y - h/2 - 12));
        i0.size.set(24, 24);
        i0.src = window.singlestarImg;
        i0.aboveBtn = true;
        break;
      case 1:
        var entity3 = world
          .createEntity()
          .addComponent(Images)
        var i0 = entity3.getMutableComponent(Images);
        i0.position.set(screenFixX(x - 12), screenFixY(y - h/2 - 12));
        i0.size.set(24, 24);
        i0.src = window.singlestarImg;
        i0.aboveBtn = true;
        break;
      default:

    }

  }
}
