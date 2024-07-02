import {World, System} from '../build/ecsy.module.js';
import {Movement,
   Circle,
   Button,
   Texts,
    CanvasContext, DemoSettings, Intersecting} from './components.js';
import {MovementSystem, Renderer, IntersectionSystem} from './systems.js';
import {random,
  screenFixX,
  screenFixY,
  genButton,
} from './utils.js';

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

    this.world = new World();

    this.world
      .registerComponent(Texts)
      .registerComponent(Button)
      .registerComponent(Circle)
      .registerComponent(Movement)
      .registerComponent(Intersecting)
      .registerComponent(CanvasContext)
      .registerComponent(DemoSettings)
      .registerSystem(MovementSystem)
      .registerSystem(Renderer)
      .registerSystem(IntersectionSystem);
    // this.restart()

    var singletonEntity = this.world.createEntity()
        .addComponent(CanvasContext)
        .addComponent(DemoSettings);

    var canvas = document.querySelector("canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    var canvasComponent = singletonEntity.getMutableComponent(CanvasContext);
    canvasComponent.ctx = canvas.getContext("2d");
    canvasComponent.width = canvas.width;
    canvasComponent.height = canvas.height;

    // for (var i = 0; i < 6; i++) {
    //   var entity = world
    //     .createEntity()
    //     .addComponent(Circle)
    //     .addComponent(Movement);
    //
    //   var circle = entity.getMutableComponent(Circle);
    //   circle.position.set(random(0, canvas.width), random(0, canvas.height));
    //   circle.radius = random(20, 100);
    //
    //   var movement = entity.getMutableComponent(Movement);
    //   movement.velocity.set(random(-80, 80), random(-80, 80));
    // }
    this.initbutton()

    window.world = this.world;

    // window.addEventListener( 'resize', () => {
    //   canvasComponent.width = canvas.width = window.innerWidth
    //   canvasComponent.height = canvas.height = window.innerHeight;
    // }, false );

    window.lastTime = performance.now();
    // console.log('requestAnimationFrame update')

    update()
  }
  initbutton(){
    var entity3 = this.world
      .createEntity()
      .addComponent(Button)

    var i0 = entity3.getMutableComponent(Button);
    i0.position.set(screenFixX((375 - 300)/2), screenFixY((812-300)));
    i0.size.set(300, 70);

    genButton(this.world,375/2,812-165,300,70, window.userLanguage == 'en' ? 'CHALLENGE':'挑战',window.starSum < 0,0,window.starSum < 0,10)

  }


  initPlayer() {
    let player = this.world
      .createEntity()
      .addComponent(Player)
      .addComponent(Movement);

    var player0 = player.getMutableComponent(Player);
    player0.position.set(0,0);
    // playerImg.onload
    // player0.playerImg = playerImg;
    player0.radius = 5;
    player0.health = 5;
  }

}
