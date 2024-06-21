import {World, System} from '../build/ecsy.module.js';
import {Movement, Circle, CanvasContext, DemoSettings, Intersecting} from './components.js';
import {MovementSystem, Renderer, IntersectionSystem} from './systems.js';
import {random} from './utils.js';

function update() {
  var time = performance.now();
  var delta = time - window.lastTime;
  window.lastTime = time;
  world.execute(delta);
  window.requestAnimationFrame(update);
  // console.log('requestAnimationFrame update')
}

export default class Main {
  constructor() {
    // 维护当前requestAnimationFrame的id
    this.aniId = 0

    var world = new World();

    world
      .registerComponent(Circle)
      .registerComponent(Movement)
      .registerComponent(Intersecting)
      .registerComponent(CanvasContext)
      .registerComponent(DemoSettings)
      .registerSystem(MovementSystem)
      .registerSystem(Renderer)
      .registerSystem(IntersectionSystem);
    // this.restart()

    var singletonEntity = world.createEntity()
        .addComponent(CanvasContext)
        .addComponent(DemoSettings);

    var canvas = document.querySelector("canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    var canvasComponent = singletonEntity.getMutableComponent(CanvasContext);
    canvasComponent.ctx = canvas.getContext("2d");
    canvasComponent.width = canvas.width;
    canvasComponent.height = canvas.height;

    for (var i = 0; i < 6; i++) {
      var entity = world
        .createEntity()
        .addComponent(Circle)
        .addComponent(Movement);

      var circle = entity.getMutableComponent(Circle);
      circle.position.set(random(0, canvas.width), random(0, canvas.height));
      circle.radius = random(20, 100);

      var movement = entity.getMutableComponent(Movement);
      movement.velocity.set(random(-80, 80), random(-80, 80));
    }

    window.world = world;
    window.Circle = Circle;
    window.Movement = Movement;

    window.addEventListener( 'resize', () => {
      canvasComponent.width = canvas.width = window.innerWidth
      canvasComponent.height = canvas.height = window.innerHeight;
    }, false );

    window.lastTime = performance.now();
    console.log('requestAnimationFrame update')
    update()
  }

}
