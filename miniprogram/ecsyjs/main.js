import {World, System} from '../build/ecsy.module.js';
import {Movement,
   Circle,
   Button,
   Confetti,
   Firework,
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
    window.timeLeft = 100
    window.countScroe = 0
    window.pop = '+1'
    this.world = new World();

    this.world
      .registerComponent(Texts)
      .registerComponent(Button)
      .registerComponent(Confetti)
      .registerComponent(Firework)
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
    this.init()
    canvas.addEventListener('touchstart', this.touchHandlerDealerselect.bind(this))
    window.world = this.world;
    console.log(window.world)
    // window.addEventListener( 'resize', () => {
    //   canvasComponent.width = canvas.width = window.innerWidth
    //   canvasComponent.height = canvas.height = window.innerHeight;
    // }, false );

    window.lastTime = performance.now();
    // console.log('requestAnimationFrame update')

    update()
  }
  init(){
    // var entity3 = this.world
    //   .createEntity()
    //   .addComponent(Button)
    //
    // var i0 = entity3.getMutableComponent(Button);
    // i0.position.set(screenFixX((375 - 300)/2), screenFixY((812-300)));
    // i0.size.set(300, 70);

    // genButton(this.world,375/2,812-165,50,50, window.userLanguage == 'en' ? 'CHALLENGE':'+',window.starSum < 0,0,window.starSum < 0,10)
    this.genButtonNew(random(0,325),random(0,812-50),50,50)
    this.genText('countScroe',20,40,'0')
  }

  genText(id='',x,y,t,s=36){
    var entity0 = this.world
      .createEntity()
      .addComponent(Texts)
    var t0 = entity0.getMutableComponent(Texts);
     t0.position.set(screenFixX(x), screenFixY(y));
     t0.id = id;
     t0.text = t;
     t0.color = '#ffffff';
     t0.size = s;
  }
  genButtonNew(x,y,w,h,t){
    // console.log('genButtonNew')
    var entity3 = this.world
     .createEntity()
     .addComponent(Button)

   var i0 = entity3.getMutableComponent(Button);
   i0.position.set(screenFixX(x), screenFixY(y));
   i0.size.set(w, h);
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

  checkselecButton(x,y) {
    var buttons = this.world.systemManager._executeSystems[1].queries.buttons.results;
    for (var item of buttons) {
      if (x > (item._components[1].position.x)
        && x < (item._components[1].position.x + item._components[1].size.x)
        && y > (item._components[1].position.y)
        && y < (item._components[1].position.y + item._components[1].size.y)) {

          return true
      }
    // window.levelNum += 1
    }
    // window.levelNum = 0
    return false
  }

  removeEntities(_array) {
    for (var item of _array) {
      if (item.length >= 1 ) {
        for (var i = 0; i < item.length; i++) {
            item[0].remove()
          i--
        }
      }
    }
  }

  removeBtn(){
      this.world.systemManager._executeSystems[1].queries.buttons.results[0].remove()
  }

  genFirework(x,y){
    for (var i = 0; i < 50; i++) {
      var entity3 = this.world
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
  genConfetti(x,y){
    for (var i = 0; i < 30; i++) {
      var entity3 = this.world
        .createEntity()
        .addComponent(Confetti)

      var i0 = entity3.getMutableComponent(Confetti);
      i0.position.set(screenFixX(x + random(-15,15)),screenFixY(y + random(-15,15)));
      // i0.size.set(300, 350);
      i0.color = `rgb(${random(0,255)}, ${random(0,255)},${random(0,255)})`;
      i0.count = random(0,10)
      i0.rotate = random(0,6.28)
      i0.height = random(414,1600)
    }
  }

  touchHandlerDealerselect(e) {
      e.preventDefault()
      // console.log('touchHandlerDealerselect')
      if (
        this.checkselecButton(e.touches[0].clientX,e.touches[0].clientY)

      ){
        window.countScroe += 1
        this.removeBtn()
        // this.genConfetti(e.touches[0].clientX,e.touches[0].clientY)
        this.genFirework(e.touches[0].clientX,e.touches[0].clientY)
        this.genText('pop',e.touches[0].clientX,e.touches[0].clientY,'+1',24)
        this.genButtonNew(random(0,325),random(0,812-50),50,50)
      }
  }

}
